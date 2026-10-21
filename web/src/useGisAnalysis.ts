import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  DatasetFeature,
  FeatureQuery,
  ProcessingJob,
  ProcessingTool,
} from './gis-types';
import { gisApi } from './gis-api';
import { showGisPage } from './gis-map';

export type GisAnalysisProps = GisPanelProps;
export function useGisAnalysis({
  datasets,
  capabilities,
  map,
  mutate,
}: GisAnalysisProps) {
  const [search, setSearch] = useState(''),
    [tool, setTool] = useState<ProcessingTool>('buffer'),
    [input, setInput] = useState(''),
    [overlay, setOverlay] = useState(''),
    [inputQuery, setInputQuery] = useState<Partial<FeatureQuery>>({}),
    [overlayQuery, setOverlayQuery] = useState<Partial<FeatureQuery>>({}),
    [name, setName] = useState('Analysis result'),
    [distance, setDistance] = useState(10),
    [field, setField] = useState(''),
    [inputField, setInputField] = useState(''),
    [overlayField, setOverlayField] = useState(''),
    [fields, setFields] = useState<string[]>([]),
    [expression, setExpression] = useState(''),
    [predicate, setPredicate] = useState('intersects'),
    [format, setFormat] = useState('geojson'),
    [jobs, setJobs] = useState<ProcessingJob[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      id: string;
      features: DatasetFeature[];
    }>(),
    [reviewed, setReviewed] = useState(false);

  const source = datasets.find((d) => d.id === input) || datasets[0],
    other = datasets.find((d) => d.id === overlay),
    canEdit = capabilities.capabilities.includes('edit');

  const load = async () => setJobs(await gisApi('gis-jobs', {}));

  useEffect(() => {
    let stopped = false;
    const update = () => {
      void gisApi('gis-jobs', {})
        .then((result) => {
          if (!stopped) setJobs(result);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    };
    update();
    const timer = setInterval(update, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!preview || !map || !source) return;
    return showGisPage(
      map,
      { ...source, style: { mode: 'single', color: '#b34de0' } },
      preview.features,
      new Set(),
      () => {},
    );
  }, [preview, map, source]);

  const attempt = async (work: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rerun = (job: ProcessingJob) => {
    const r = job.request,
      p = r.parameters;
    setTool(r.tool);
    setInput(r.input.datasetId);
    setOverlay(r.overlay?.datasetId || '');
    setInputQuery({ ...r.input, cursor: undefined });
    setOverlayQuery({ ...r.overlay, cursor: undefined });
    setName(r.name);
    setDistance(Number(p.distance ?? 10));
    setField(String(p.field || ''));
    setExpression(String(p.expression || ''));
    setInputField(String(p.inputField || ''));
    setOverlayField(String(p.overlayField || ''));
    setFields(Array.isArray(p.fields) ? (p.fields as string[]) : []);
    setPredicate(String(p.predicate || 'intersects'));
    setFormat(String(p.format || 'geojson'));
  };
  return {
    search,
    setSearch,
    tool,
    setTool,
    source,
    setInput,
    setInputQuery,
    datasets,
    overlay,
    setOverlay,
    setOverlayQuery,
    setFields,
    name,
    setName,
    other,
    inputQuery,
    overlayQuery,
    distance,
    setDistance,
    predicate,
    setPredicate,
    field,
    setField,
    inputField,
    setInputField,
    overlayField,
    setOverlayField,
    fields,
    expression,
    setExpression,
    format,
    setFormat,
    error,
    canEdit,
    busy,
    attempt,
    mutate,
    jobs,
    rerun,
    setPreview,
    setReviewed,
    setError,
    preview,
    reviewed,
  };
}
export type GisAnalysisState = ReturnType<typeof useGisAnalysis>;
