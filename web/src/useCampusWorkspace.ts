import { useCampusImportPolling } from './useCampusImportPolling';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './supabase';
import { lasuCampus, type CampusIdentity } from './campus-context';
import { getPreference, setPreference, hashBytes } from './offline';
import type { CampusData, Position } from './types';
import { finitePosition } from './validation';
import type {
  CampusImport,
  CampusSource,
  ImportConfiguration,
  ImportSourceKind,
} from './map-import-types';
import { sameImportConfiguration } from './map-import-types';
import { processes } from './process-monitor';
import {
  Identity,
  blank,
  suggestMappings,
} from './campus-import-configuration';
export type CampusWorkspaceProps = {
  current?: CampusIdentity;
  currentData?: CampusData;
  owner: string;
  dark: boolean;
  onClose: () => void;
  onSwitch: (campus: CampusIdentity) => Promise<void>;
  onReview: () => Promise<void>;
};
export function useCampusWorkspace({
  current = lasuCampus,
  currentData,
  owner,
  dark,
  onClose,
  onSwitch,
  onReview,
}: CampusWorkspaceProps) {
  const [campuses, setCampuses] = useState<Identity[]>([]),
    [sources, setSources] = useState<CampusSource[]>([]),
    [imports, setImports] = useState<CampusImport[]>([]);

  const [query, setQuery] = useState(''),
    [creating, setCreating] = useState(false),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');

  const [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [vertices, setVertices] = useState<Position[]>([]),
    [boundaryText, setBoundaryText] = useState(''),
    [drawing, setDrawing] = useState(false);

  const [sourceKind, setSourceKind] = useState<ImportSourceKind>('file'),
    [sourceName, setSourceName] = useState(''),
    [sourceUrl, setSourceUrl] = useState('');

  const [job, setJob] = useState<CampusImport | null>(null),
    [configuration, setConfiguration] = useState<ImportConfiguration>(blank),
    [scheduledOsm, setScheduledOsm] = useState(false);

  const [uncertainReview, setUncertainReview] = useState<string | null>(null);

  const [centre, setCentre] = useState(''),
    [previewCampus, setPreviewCampus] = useState(current);

  const [boundaryIndex, setBoundaryIndex] = useState(0);

  const boundaryChoices = useMemo<CampusData['boundary'][]>(() => {
    try {
      const value = JSON.parse(boundaryText);
      const features =
        value.type === 'FeatureCollection'
          ? value.features
          : [
              value.type === 'Feature'
                ? value
                : { type: 'Feature', properties: {}, geometry: value },
            ];
      return features.filter((f: GeoJSON.Feature) =>
        ['Polygon', 'MultiPolygon'].includes(f.geometry?.type),
      );
    } catch {
      return [];
    }
  }, [boundaryText]);

  const importedBoundary = boundaryChoices[boundaryIndex] || boundaryChoices[0];

  const boundaryCampus = useMemo(() => {
    if (!importedBoundary) return previewCampus;
    const points: Position[] = [];
    const visit = (value: unknown) => {
      if (finitePosition(value)) points.push([value[0], value[1]]);
      else if (Array.isArray(value)) value.forEach(visit);
    };
    if ('coordinates' in importedBoundary.geometry)
      visit(importedBoundary.geometry.coordinates);
    if (!points.length || points.length > 10000) return previewCampus;
    return {
      ...previewCampus,
      bounds: [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ] as [Position, Position],
    };
  }, [importedBoundary, previewCampus]);

  const refresh = useCallback(async () => {
    const [directory, queue] = await Promise.all([
      api<{ campuses: Identity[] }>('campus-list'),
      api<{
        sources: CampusSource[];
        imports: CampusImport[];
        scheduledOsmEnabled: boolean;
      }>('import-list'),
    ]);
    setCampuses(directory.campuses);
    setSources(queue.sources);
    setImports(queue.imports);
    setScheduledOsm(queue.scheduledOsmEnabled);
    return queue.imports;
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);

  const resumable = job && ['running', 'queued'].includes(job.status);

  useCampusImportPolling({
    job,
    setJob,
    setConfiguration,
    setNotice,
    setError,
  });

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const recoveryKey = `import-wizard:${owner}:${current.id}`;

  useEffect(() => {
    void getPreference<{
      name: string;
      slug: string;
      vertices: Position[];
      boundaryText: string;
    } | null>(recoveryKey, null).then((d) => {
      if (d) {
        setName(d.name);
        setSlug(d.slug);
        setVertices(d.vertices);
        setBoundaryText(d.boundaryText);
      }
    });
  }, [recoveryKey]);

  useEffect(() => {
    if (!creating) return;
    const timer = setTimeout(
      () =>
        void setPreference(recoveryKey, { name, slug, vertices, boundaryText }),
      300,
    );
    return () => clearTimeout(timer);
  }, [name, slug, vertices, boundaryText, creating, recoveryKey]);

  const openJob = async (next: CampusImport) => {
    const saved = await getPreference<ImportConfiguration | null>(
      `${recoveryKey}:${next.id}`,
      null,
    );
    setJob(next);
    setAdding(false);
    setCreating(false);
    setConfiguration(
      saved &&
        !['running', 'queued', 'reviewed', 'cancelled'].includes(next.status)
        ? saved
        : next.status === 'mapping'
          ? suggestMappings(next)
          : next.configuration,
    );
  };

  useEffect(() => {
    if (!job || !['mapping', 'preview', 'failed', 'draft'].includes(job.status))
      return;
    const timer = setTimeout(
      () => void setPreference(`${recoveryKey}:${job.id}`, configuration),
      300,
    );
    return () => {
      clearTimeout(timer);
      // Leaving the wizard must retain the final edit even before debounce fires.
      void setPreference(`${recoveryKey}:${job.id}`, configuration);
    };
  }, [job, configuration, recoveryKey]);

  const selectedSource = sources.find((s) => s.id === job?.source_id);

  const counts = job?.summary?.counts;

  const reviewBlocker =
    job?.status !== 'preview'
      ? ''
      : uncertainReview === job.id
        ? 'Check review status before submitting this import again.'
        : busy
          ? 'Wait for the current operation to finish.'
          : !job.summary
            ? 'Preview details are unavailable. Reopen this import or rebuild its preview.'
            : job.summary.errors.length && !job.summary.comparisonVersion
              ? 'Resolve the preview errors shown above, then rebuild the preview.'
              : !sameImportConfiguration(configuration, job.configuration)
                ? 'Settings changed since this preview was built. Rebuild preview to include your changes.'
                : '';

  const filesChanged = async (files: File[]) =>
    run(async () => {
      if (!files.length || !job) return;
      if (
        Array.from(files).reduce((sum, f) => sum + f.size, 0) >
        50 * 1024 * 1024
      )
        throw new Error('Choose an upload batch no larger than 50 MiB.');
      const progress = processes.begin('Map file upload', 'Preparing files');
      let uploaded = 0;
      try {
        for (const file of Array.from(files)) {
          progress.update(
            `Uploading ${file.name}`,
            uploaded,
            files.length,
            'files',
          );
          const bytes = await file.arrayBuffer(),
            sha256 = await hashBytes(bytes);
          const result = await api<{ url: string; job?: CampusImport }>(
            'import-upload',
            {
              importId: job.id,
              name: file.name,
              bytes: file.size,
              sha256,
            },
          );
          if (result.job) setJob(result.job);
          const response = await fetch(result.url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-upsert': 'false',
            },
            body: file,
            signal: AbortSignal.timeout(120000),
          });
          const failed = !response.ok
            ? await response.json().catch(() => ({}))
            : null;
          if (
            !response.ok &&
            failed?.error !== 'Duplicate' &&
            failed?.statusCode !== '409'
          )
            throw new Error(
              'Upload was interrupted. Select the same files to resume; completed uploads will be retained.',
            );
          uploaded++;
        }
        progress.finish(`${uploaded} files uploaded; ready to inspect`);
      } catch (error) {
        progress.fail(error);
        throw error;
      }
      setNotice(`${files.length} file(s) uploaded. Inspect the layers next.`);
    });

  const startPhase = async (phase: 'inspect' | 'preview') =>
    run(async () => {
      if (!job) return;
      const result = await api<{ job: CampusImport }>('import-run', {
        importId: job.id,
        phase,
        configuration,
      });
      setJob(result.job);
    });

  const mappedCount = useMemo(
    () => configuration.layers.filter((l) => l.role !== 'skip').length,
    [configuration],
  );
  return {
    onClose,
    query,
    setQuery,
    setCreating,
    setJob,
    setAdding,
    campuses,
    current,
    run,
    onSwitch,
    busy,
    error,
    notice,
    creating,
    name,
    setName,
    setSlug,
    slug,
    centre,
    setCentre,
    setError,
    setPreviewCampus,
    drawing,
    setDrawing,
    vertices,
    setVertices,
    boundaryCampus,
    importedBoundary,
    dark,
    boundaryText,
    setBoundaryText,
    boundaryChoices,
    boundaryIndex,
    setBoundaryIndex,
    recoveryKey,
    job,
    selectedSource,
    refresh,
    filesChanged,
    startPhase,
    resumable,
    configuration,
    setConfiguration,
    sources,
    mappedCount,
    currentData,
    counts,
    reviewBlocker,
    setUncertainReview,
    setNotice,
    uncertainReview,
    onReview,
    adding,
    sourceKind,
    setSourceKind,
    sourceName,
    setSourceName,
    sourceUrl,
    setSourceUrl,
    openJob,
    scheduledOsm,
    imports,
  };
}
export type CampusWorkspaceState = ReturnType<typeof useCampusWorkspace>;
