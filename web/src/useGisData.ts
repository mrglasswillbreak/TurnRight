import { useEffect, useMemo, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  DatasetField,
  DatasetFeature,
  FeaturePage,
  FeatureQuery,
  FieldValue,
} from './gis-types';
import { gisApi } from './gis-api';
import { valueErrors } from './gis-contracts';
import { showGisPage } from './gis-map';

export type GisDataProps = GisPanelProps;
export function useGisData({
  datasets,
  capabilities,
  map,
  mutate,
  refresh,
  onEdit,
  onEndEditingSession,
}: GisDataProps) {
  const [id, setId] = useState(''),
    [pageResult, setPageResult] = useState<{
      key: string;
      page: FeaturePage;
    }>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [query, setQuery] = useState<Partial<FeatureQuery>>({}),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState<(string | undefined)[]>([]),
    [selected, setSelected] = useState(new Set<string>()),
    [columns, setColumns] = useState<string[]>([]),
    [extent, setExtent] = useState(false),
    [epoch, setEpoch] = useState(0),
    [name, setName] = useState('Asset table');

  const [field, setField] = useState(''),
    [operator, setOperator] = useState('contains'),
    [value, setValue] = useState(''),
    [stats, setStats] = useState('');

  const dataset = datasets.find((d) => d.id === id) || datasets[0],
    editable = capabilities.capabilities.includes('edit');

  const revision = dataset?.revision;

  const datasetId = dataset?.id;

  const requestKey = JSON.stringify([
    datasetId,
    revision,
    query,
    cursor,
    epoch,
  ]);

  // Hide the previous page synchronously when a query changes. It must not
  // remain editable until the loading effect or response arrives.
  const page = pageResult?.key === requestKey ? pageResult.page : undefined;

  const schemaKey = JSON.stringify(dataset?.schema.fields || []);

  useEffect(() => {
    const fields = JSON.parse(schemaKey) as DatasetField[];
    setId(datasetId || '');
    setQuery({});
    setCursor(undefined);
    setHistory([]);
    setSelected(new Set());
    setColumns(fields.map((f) => f.name).slice(0, 8));
    setField(fields[0]?.name || '');
  }, [datasetId, schemaKey]);

  useEffect(() => {
    if (revision === undefined) return;
    setCursor(undefined);
    setHistory([]);
    setSelected(new Set());
  }, [revision]);

  useEffect(() => {
    if (!datasetId || revision === undefined) return;
    let cancelled = false;
    setLoading(true);
    setPageResult(undefined);
    setError('');
    void gisApi('gis-query', {
      limit: 100,
      ...query,
      datasetId,
      revision,
      ...(cursor ? { cursor } : {}),
      geometry: true,
    })
      .then((result) => {
        if (!cancelled) setPageResult({ key: requestKey, page: result });
      })
      .catch((e) => {
        if (!cancelled) {
          setPageResult(undefined);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, revision, query, cursor, epoch, requestKey]);

  useEffect(() => {
    if (!map || !dataset || !page) return;
    return showGisPage(map, dataset, page.features, selected, (key) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else if (next.size < 500) next.add(key);
        return next;
      }),
    );
  }, [map, dataset, page, selected]);

  useEffect(() => {
    if (!map || !extent) return;
    const update = () => {
      const b = map.getBounds();
      setQuery((q) => ({
        ...q,
        bbox: [
          Math.max(-180, b.getWest()),
          Math.max(-90, b.getSouth()),
          Math.min(180, b.getEast()),
          Math.min(90, b.getNorth()),
        ],
      }));
      setCursor(undefined);
      setHistory([]);
    };
    update();
    map.on('moveend', update);
    return () => {
      map.off('moveend', update);
    };
  }, [map, extent]);

  const fields = useMemo(
    () => dataset?.schema.fields.filter((f) => columns.includes(f.name)) || [],
    [dataset, columns],
  );

  const attempt = async (work: () => Promise<unknown>) => {
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (
    feature: DatasetFeature,
    field: DatasetField,
    text: string,
  ) => {
    if (!dataset || !page) return;
    const value: FieldValue =
      text === ''
        ? null
        : field.type === 'number'
          ? Number(text)
          : field.type === 'boolean'
            ? text === 'true'
            : text;
    const errors = valueErrors(field, value);
    if (errors.length) throw Error(errors.join(' '));
    if (value === feature.properties[field.name]) return;
    await mutate(() =>
      gisApi('gis-attributes-save', {
        datasetId: dataset.id,
        expectedRevision: page.revision,
        operationId: crypto.randomUUID(),
        features: [{ key: feature.id, values: { [field.name]: value } }],
      }),
    );
    setEpoch((e) => e + 1);
  };
  return {
    editable,
    onEndEditingSession,
    attempt,
    dataset,
    setId,
    datasets,
    refresh,
    setEpoch,
    name,
    setName,
    mutate,
    error,
    field,
    setField,
    operator,
    setOperator,
    value,
    setValue,
    setQuery,
    setCursor,
    setHistory,
    setExtent,
    query,
    setStats,
    stats,
    extent,
    columns,
    setColumns,
    loading,
    page,
    selected,
    setSelected,
    fields,
    map,
    onEdit,
    save,
    history,
    cursor,
  };
}
export type GisDataState = ReturnType<typeof useGisData>;
