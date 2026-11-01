import { Map as CampusMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../web/src/map-worker';
import {
  createCampusModels,
  type ModelOptions,
} from '../../web/src/campus-model-layer';
import { installPackage, loadCampus } from '../../web/src/offline';
import type { CampusData, CampusPackage } from '../../web/src/types';

export async function campaign(offline = false) {
  console.log('Campaign loading data');
  let data: CampusData, manifest: CampusPackage;
  if (offline) ({ data, manifest } = await loadCampus('lasu'));
  else {
    manifest = await (await fetch('/packages/latest.json')).json();
    data = await (await fetch(manifest.dataUrl)).json();
  }
  const pilots = data.visuals!.detailedModels!;
  const center: [number, number] = [
    pilots.reduce((n, p) => n + p.origin[0], 0) / pilots.length,
    pilots.reduce((n, p) => n + p.origin[1], 0) / pilots.length,
  ];
  const map = new CampusMap({
    container: 'map',
    center,
    zoom: innerWidth < 500 ? 15.3 : 16.2,
    pitch: 50,
    bearing: 15,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        buildings: { type: 'geojson', data: data.map },
        empty: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        },
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#f2f0e9' },
        },
        {
          id: 'base-buildings',
          type: 'fill-extrusion',
          source: 'buildings',
          filter: ['==', ['get', 'kind'], 'building'],
          paint: {
            'fill-extrusion-color': '#d5cfbd',
            'fill-extrusion-height': ['coalesce', ['get', 'height'], 6],
            'fill-extrusion-opacity': 1,
          },
        },
        { id: 'barriers', type: 'line', source: 'empty' },
      ],
    },
  });
  const graphics = () => {
    const gl = map.getCanvas().getContext('webgl2') as WebGL2RenderingContext;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR),
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      userAgent: navigator.userAgent,
      devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  };
  console.log('Campaign graphics ' + JSON.stringify(graphics()));
  console.log('Campaign loading map');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Map initialization exceeded 90 seconds.')),
      90000,
    );
    map.once('load', () => {
      clearTimeout(timer);
      resolve();
    });
    map.once('error', (event) => {
      clearTimeout(timer);
      reject(event.error);
    });
  });
  console.log('Campaign map ready');
  const options: ModelOptions = {
    data,
    enabled: true,
    dark: false,
    selectedId: '',
    sceneryEnabled: true,
    onStatus: () => {},
    onReady: (ids) =>
      map.setFilter('base-buildings', [
        'all',
        ['==', ['get', 'kind'], 'building'],
        ['!', ['in', ['get', 'id'], ['literal', ids]]],
      ]),
  };
  const models = createCampusModels(map, options);
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  async function ready(id: string) {
    const until = performance.now() + 60000;
    while (!models.statistics().detailIds.includes(id)) {
      if (performance.now() > until)
        throw new Error(`Detailed building did not load: ${id}`);
      await delay(100);
    }
  }
  async function settled() {
    const until = performance.now() + 60000;
    let quiet = 0;
    while (quiet < 5) {
      if (performance.now() > until)
        throw new Error('Model streaming did not settle.');
      quiet = models.statistics().pendingRequests === 0 ? quiet + 1 : 0;
      await delay(100);
    }
  }
  return {
    ids: pilots.map((p) => p.id),
    statistics: models.statistics,
    graphics,
    async visit(id: string) {
      console.log('Campaign visiting ' + id);
      const building = pilots.find((p) => p.id === id)!;
      options.selectedId = id;
      models.update({ ...options });
      map.jumpTo({ center: building.origin, zoom: 18, pitch: 55, bearing: 25 });
      await ready(id);
      await new Promise<void>((resolve) => {
        map.once('render', () => resolve());
        map.triggerRepaint();
      });
      const at = map.project(building.origin);
      let hit = models.pick([at.x, at.y - 20]);
      for (const dx of [-40, 0, 40])
        for (const dy of [-60, -20, 20, 60])
          if (hit?.buildingId !== id) hit = models.pick([at.x + dx, at.y + dy]);
      // A courtyard can surround the anchor; select a visible perimeter wall.
      const feature = data.map.features.find((f) => f.properties?.id === id)!;
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiPolygon'
            ? feature.geometry.coordinates
            : [];
      for (const polygon of polygons)
        for (const ring of polygon)
          for (let i = 0; i < ring.length - 1 && hit?.buildingId !== id; i++) {
            const a = ring[i],
              b = ring[i + 1];
            const point = map.project([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
            hit = models.pick([point.x, point.y - 12]);
          }
      if (hit?.buildingId !== id)
        throw new Error(`The visible building could not be selected: ${id}`);
      return { ...models.statistics(), picked: hit?.buildingId };
    },
    async overview() {
      map.jumpTo({
        center,
        zoom: innerWidth < 500 ? 15.3 : 16.2,
        bearing: 25,
        pitch: 55,
      });
      await delay(1500);
      await settled();
      return models.statistics();
    },
    async away() {
      map.jumpTo({ center: [3.25, 6.51], zoom: 18 });
      await delay(350);
      return models.statistics();
    },
    theme(dark: boolean) {
      options.dark = dark;
      models.update({ ...options });
      map.setPaintProperty(
        'background',
        'background-color',
        dark ? '#202630' : '#f2f0e9',
      );
    },
    async measure() {
      await settled();
      const times: number[] = [];
      map.easeTo({ bearing: map.getBearing() + 80, duration: 12000 });
      const started = performance.now();
      let previous = started;
      await new Promise<void>((resolve) => {
        const frame = () => {
          const now = performance.now();
          times.push(now - previous);
          previous = now;
          map.triggerRepaint();
          if (now - started < 12000) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      map.stop();
      times.shift();
      times.sort((a, b) => a - b);
      return {
        durationMs: previous - started,
        samples: times.length,
        averageFps: 1000 / (times.reduce((n, t) => n + t, 0) / times.length),
        p50FrameMs: times[Math.floor(times.length * 0.5)],
        p95FrameMs: times[Math.floor(times.length * 0.95)],
        maxFrameMs: times.at(-1),
        frameMs: times,
        ...models.statistics(),
      };
    },
    async recoverGraphics() {
      const extension = (
        map.getCanvas().getContext('webgl2') as WebGL2RenderingContext
      ).getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('WebGL recovery extension unavailable.');
      const restored = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('WebGL restoration timed out.')),
          30000,
        );
        map.once('webglcontextrestored', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      extension.loseContext();
      await delay(400);
      extension.restoreContext();
      await restored;
      if (!map.isStyleLoaded())
        await new Promise<void>((resolve) =>
          map.once('style.load', () => resolve()),
        );
      await delay(250);
      await ready(options.selectedId);
      return models.statistics();
    },
    async download() {
      let last = -1;
      await installPackage(manifest, (progress) => {
        const step = Math.floor(progress / 10);
        if (step > last) {
          last = step;
          console.log(`Offline verification ${progress}%`);
        }
      });
      const result = await loadCampus('lasu');
      if (!(await result.verification))
        throw new Error('Offline package audit failed.');
      return {
        bytes: manifest.bytes,
        assets: manifest.assets.length,
        verified: true,
      };
    },
    dispose() {
      models.dispose();
      map.remove();
    },
  };
}
declare global {
  interface Window {
    campaign: Awaited<ReturnType<typeof campaign>>;
  }
}
