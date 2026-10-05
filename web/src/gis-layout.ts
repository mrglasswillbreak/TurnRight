import type { Map as MapInstance } from 'maplibre-gl';
import type { Dataset } from './gis-types';
import { requestedCampus } from './campus-context';
import { pngWithReceipt } from './gis-layout-metadata';
const receipts = new WeakMap<HTMLCanvasElement, object>();
type LayoutDataset = Pick<Dataset, 'name' | 'style'> & Partial<Dataset>;
export interface LayoutRelease {
  version: string;
  createdAt: string;
  campusId: string;
  assets: { url: string; sha256: string; bytes: number }[];
}
export async function renderMapLayout(
  map: MapInstance,
  datasets: LayoutDataset[],
  title: string,
  paper: 'A4' | 'A3',
  attribution: string,
  release?: LayoutRelease,
) {
  if (map.getPitch() > 1)
    throw Error('Use a flat map view before exporting a map with a scale bar.');
  if (!map.areTilesLoaded())
    throw Error('Wait for the map tiles to finish loading before exporting.');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(Error('Map is still rendering. Retry when tiles have loaded.')),
      15000,
    );
    map.once('render', () => {
      clearTimeout(timeout);
      resolve();
    });
    map.triggerRepaint();
  });
  const canvas = document.createElement('canvas');
  canvas.width = paper === 'A3' ? 2480 : 1754;
  canvas.height = paper === 'A3' ? 1754 : 1240;
  const context = canvas.getContext('2d');
  if (!context) throw Error('Canvas export is unavailable.');
  const margin = 60,
    width = canvas.width - margin * 2,
    height = canvas.height - 280;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#172033';
  context.font = 'bold 34px sans-serif';
  context.fillText(title.slice(0, 90), margin, 60, width);
  const source = map.getCanvas();
  const fit = Math.min(width / source.width, height / source.height),
    drawWidth = source.width * fit,
    drawHeight = source.height * fit;
  context.drawImage(
    source,
    margin + (width - drawWidth) / 2,
    95 + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.fillStyle = '#fff';
  context.fillRect(canvas.width - 135, 110, 60, 80);
  context.save();
  context.translate(canvas.width - 105, 155);
  context.rotate((-map.getBearing() * Math.PI) / 180);
  context.fillStyle = '#172033';
  context.beginPath();
  context.moveTo(0, -22);
  context.lineTo(-12, 15);
  context.lineTo(0, 8);
  context.lineTo(12, 15);
  context.closePath();
  context.fill();
  context.restore();
  context.font = '18px sans-serif';
  context.fillText('N', canvas.width - 111, 132);
  const center = map.getCenter(),
    groundMeters =
      (((40075016.68557849 * Math.cos((center.lat * Math.PI) / 180)) /
        Math.pow(2, map.getZoom() + 9)) *
        map.getCanvas().clientWidth) /
      drawWidth;
  const target = groundMeters * 150,
    power = 10 ** Math.floor(Math.log10(target)),
    length =
      [1, 2, 5, 10].map((v) => v * power).find((v) => v >= target) ||
      power * 10,
    pixels = length / groundMeters;
  context.fillStyle = '#fff';
  context.fillRect(margin + 10, 95 + height - 70, pixels + 30, 55);
  context.strokeStyle = '#172033';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(margin + 20, 95 + height - 40);
  context.lineTo(margin + 20 + pixels, 95 + height - 40);
  context.stroke();
  context.fillStyle = '#172033';
  context.font = '16px sans-serif';
  context.fillText(
    length >= 1000 ? `${length / 1000} km` : `${length} m`,
    margin + 20,
    95 + height - 48,
  );
  let x = margin,
    y = height + 130;
  const legend = datasets.flatMap((d) =>
    d.style.classes?.length
      ? d.style.classes.map((c) => ({
          label: d.name + ': ' + c.label,
          color: c.color,
        }))
      : [{ label: d.name, color: d.style.color }],
  );
  const legendColumns = Math.floor((width - 300) / 320) + 1,
    legendRows = Math.floor((canvas.height - 70 - y) / 25) + 1;
  if (legend.length > legendColumns * legendRows)
    throw Error(
      `This ${paper} template fits ${legendColumns * legendRows} legend entries. Reduce the layers or classes before exporting.`,
    );
  for (const item of legend) {
    if (x + 300 > canvas.width - margin) {
      x = margin;
      y += 25;
    }
    context.fillStyle = item.color;
    context.fillRect(x, y - 14, 16, 16);
    context.fillStyle = '#172033';
    context.font = '16px sans-serif';
    context.fillText(item.label.slice(0, 32), x + 23, y);
    x += 320;
  }
  context.font = '14px sans-serif';
  const generatedAt = new Date().toISOString();
  context.fillText(
    `${release ? 'Release ' + release.version + ' · ' + release.createdAt.slice(0, 10) : 'Draft · ' + generatedAt.slice(0, 10)} · ${paper} · WGS84 · approximate scale at map centre`,
    margin,
    canvas.height - 45,
    width,
  );
  context.fillText(
    attribution.slice(0, 240),
    margin,
    canvas.height - 22,
    width,
  );
  receipts.set(canvas, {
    schema: 1,
    kind: 'turnright-map-layout',
    status: release ? 'released' : 'draft',
    release,
    campusId: release?.campusId || datasets[0]?.campus_id || requestedCampus(),
    title,
    paper,
    attribution,
    generatedAt,
    crs: 'EPSG:4326',
    viewport: {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      bounds: map.getBounds().toArray(),
    },
    datasets: datasets.map(
      ({
        id,
        revision,
        schema,
        style,
        source_crs,
        analysis_crs,
        provenance,
      }) => ({
        id,
        revision,
        schema,
        style,
        source_crs,
        analysis_crs,
        provenance,
      }),
    ),
  });
  return canvas;
}
export async function downloadLayout(canvas: HTMLCanvasElement, title: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Could not encode the map.'))),
      'image/png',
    ),
  );
  const png = new Uint8Array(await blob.arrayBuffer()),
    digest = new Uint8Array(await crypto.subtle.digest('SHA-256', png)),
    receipt = {
      ...receipts.get(canvas),
      imageSha256: [...digest]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    };
  const url = URL.createObjectURL(
      new Blob([pngWithReceipt(png, receipt) as Uint8Array<ArrayBuffer>], {
        type: 'image/png',
      }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = title.replace(/[^a-z0-9-]/gi, '_') + '.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printLayout(
  window: Window,
  canvas: HTMLCanvasElement,
  paper: 'A4' | 'A3',
  title: string,
) {
  const document = window.document;
  document.title = title;
  const style = document.createElement('style');
  style.textContent = `@page{size:${paper} landscape;margin:0}body{margin:0}img{width:100%;height:auto;display:block}`;
  document.head.append(style);
  const image = document.createElement('img');
  image.alt = title;
  image.src = canvas.toDataURL('image/png');
  document.body.append(image);
  image.onload = () => {
    window.focus();
    window.print();
  };
}
