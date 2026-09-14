import { useEffect, useMemo, useRef, useState } from 'react';
import type { CampusData } from './types';
import type { BuildingModel, BuildingVisual } from './visual-types';
import { buildingRevision } from './building-visuals';

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
    signatures = useRef(new Map<string, string>());
  const catalogueRevision = useRef(data.visuals?.revision);
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
  useEffect(() => {
    if (!enabled) return;
    try {
      const instance = new Worker(
        new URL('./building-preview.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = instance;
      return () => {
        instance.terminate();
        worker.current = null;
      };
    } catch {
      setError('3D preview could not start. The last valid preview is shown.');
      setPending(false);
    }
  }, [enabled, attempt]);
  useEffect(() => {
    if (!enabled || !worker.current) {
      setPending(false);
      return;
    }
    if (catalogueRevision.current !== data.visuals?.revision) { signatures.current.clear(); catalogueRevision.current = data.visuals?.revision; }
    let cancelled = false;
    const instance = worker.current,
      revision = ++sequence.current;
    const features = desired.filter(
      (f) =>
        signatures.current.get(String(f.properties?.id)) !==
        buildingRevision(f),
    );
    const wanted = new Set(desired.map((f) => String(f.properties?.id)));
    setModels((previous) => previous.filter((m) => wanted.has(m.model.id)));
    if (!features.length) {
      setPending(false);
      return;
    }
    setPending(true);
    let deadline: ReturnType<typeof setTimeout>;
    const fail = (message: string) => {
      if (revision === sequence.current) {
        setError(message);
        setPending(false);
        instance.terminate();
      }
    };
    instance.onerror = () =>
      fail('3D preview stopped. The last valid preview is shown.');
    instance.onmessage = ({ data: response }) => {
      if (cancelled || response.revision !== sequence.current) return;
      clearTimeout(deadline);
      const results = response.results as {
        id: string;
        model?: BuildingModel;
        visual?: BuildingVisual;
        error?: string;
      }[];
      setModels((previous) => {
        const next = new Map(previous.map((m) => [m.model.id, m]));
        for (const result of results)
          if (result.model && result.visual) {
            next.set(result.id, { model: result.model, visual: result.visual });
            signatures.current.set(result.id, result.model.geometryRevision);
          }
        return [...next.values()];
      });
      setError(
        results
          .filter((r) => r.error)
          .map((r) => r.error)
          .join(' '),
      );
      setPending(false);
    };
    const timer = setTimeout(() => {
      deadline = setTimeout(
        () => fail('3D preview timed out. The last valid preview is shown.'),
        15_000,
      );
      try {
        instance.postMessage({
          revision,
          features,
          visuals: data.visuals?.buildings || [],
        });
      } catch {
        clearTimeout(deadline);
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
  }, [desired, data.visuals, enabled, attempt]);
  return {
    models,
    pending,
    error,
    retry: () => {
      signatures.current.clear();
      setAttempt((n) => n + 1);
    },
  };
}
