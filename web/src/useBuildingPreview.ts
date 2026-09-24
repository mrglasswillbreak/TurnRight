import { useEffect, useMemo, useRef, useState } from 'react';
import type { CampusData } from './types';
import type { BuildingModel, BuildingVisual } from './visual-types';
import { buildingRevision } from './building-visuals';
import { detailRevision } from './building-facades';

export interface PreviewModel {
  model: BuildingModel;
  visual: BuildingVisual;
}
export function useBuildingPreview(
  data: CampusData,
  selectedId: string,
  enabled: boolean,
) {
  const [models, setModels] = useState<PreviewModel[]>([]),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    cache = useRef(
      new Map<string, { preview: PreviewModel; catalogue?: string }>(),
    );
  const desired = useMemo(
    () =>
      enabled
        ? data.map.features.filter(
            (f) =>
              f.properties?.kind === 'building' &&
              (f.properties.id === selectedId ||
                f.properties.appearance ||
                f.properties.buildingTopology),
          )
        : [],
    [data.map, selectedId, enabled],
  );
  // Autosave receipts, inspector selection and equivalent data objects must not
  // cancel an in-flight build or resend an unchanged campus to the worker.
  const requestKey = useMemo(
    () =>
      JSON.stringify([
        data.visuals?.revision,
        desired
          .map((f) => [
            String(f.properties?.id),
            buildingRevision(f),
            detailRevision(f) || '',
          ])
          .sort(([a], [b]) => a.localeCompare(b)),
      ]),
    [data.visuals?.revision, desired],
  );
  const input = useRef({ desired, visuals: data.visuals });
  input.current = { desired, visuals: data.visuals };
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [enabled],
  );
  useEffect(() => {
    if (!enabled) {
      setPending(false);
      return;
    }
    const { desired, visuals } = input.current;
    let cancelled = false;
    const revision = ++sequence.current;
    const wanted = new Set(desired.map((f) => String(f.properties?.id)));
    // Retain a bounded number of recently inspected buildings, together with
    // their signatures. Never retain a signature after evicting its mesh.
    for (const id of wanted) {
      const entry = cache.current.get(id);
      if (entry) {
        cache.current.delete(id);
        cache.current.set(id, entry);
      }
    }
    const recent = [...cache.current.keys()].filter((id) => !wanted.has(id));
    for (const id of recent.slice(0, Math.max(0, recent.length - 8)))
      cache.current.delete(id);
    const publish = () => {
      const next = [...wanted].flatMap((id) => {
        const entry = cache.current.get(id);
        return entry ? [entry.preview] : [];
      });
      setModels((previous) =>
        previous.length === next.length &&
        previous.every((m, i) => m === next[i])
          ? previous
          : next,
      );
    };
    publish();
    const features = desired.filter((f) => {
      const entry = cache.current.get(String(f.properties?.id));
      return (
        entry?.catalogue !== visuals?.revision ||
        entry?.preview.model.geometryRevision !== buildingRevision(f) ||
        entry?.preview.model.detailRevision !== detailRevision(f)
      );
    });
    if (!features.length) {
      setError('');
      setPending(false);
      return;
    }
    setPending(true);
    let deadline: ReturnType<typeof setTimeout>;
    let instance: Worker | null = null;
    const fail = (message: string) => {
      if (cancelled || revision !== sequence.current) return;
      clearTimeout(deadline);
      setError(message);
      setPending(false);
      instance?.terminate();
      if (worker.current === instance) worker.current = null;
    };
    const timer = setTimeout(() => {
      try {
        instance = worker.current ||= new Worker(
          new URL('./building-preview.worker.ts', import.meta.url),
          { type: 'module' },
        );
      } catch {
        fail('3D preview could not start. The last valid preview is shown.');
        return;
      }
      instance.onerror = () =>
        fail('3D preview stopped. The last valid preview is shown.');
      instance.onmessageerror = () =>
        fail('3D preview could not be read. The last valid preview is shown.');
      instance.onmessage = ({ data: response }) => {
        if (cancelled || response.revision !== sequence.current) return;
        clearTimeout(deadline);
        const results = response.results as {
          id: string;
          model?: BuildingModel;
          visual?: BuildingVisual;
          error?: string;
        }[];
        for (const result of results) {
          if (result.model && result.visual)
            cache.current.set(result.id, {
              preview: { model: result.model, visual: result.visual },
              catalogue: visuals?.revision,
            });
        }
        publish();
        setError(
          results
            .filter((r) => r.error)
            .map((r) => r.error)
            .join(' '),
        );
        setPending(false);
      };
      deadline = setTimeout(
        () => fail('3D preview timed out. The last valid preview is shown.'),
        15_000,
      );
      try {
        const ids = new Set(features.map((f) => String(f.properties?.id)));
        instance.postMessage({
          revision,
          features,
          visuals: visuals?.buildings.filter((v) => ids.has(v.id)) || [],
        });
      } catch {
        fail(
          '3D preview could not receive this edit. The last valid preview is shown.',
        );
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
    };
  }, [requestKey, enabled, attempt]);
  return { models, pending, error, retry: () => setAttempt((n) => n + 1) };
}
