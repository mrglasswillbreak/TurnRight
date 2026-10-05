import { useEffect, useMemo, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  DatasetField,
  DatasetFeature,
  FeaturePage,
  FieldValue,
} from './gis-types';
import { gisApi } from './gis-api';
import { valueErrors } from './gis-contracts';
import { focusGisFeature } from './gis-map';
import { useEditorSession } from './EditorSession';
import {
  attributeInputKey,
  featureReference,
  selectionKey,
  type TableContext,
} from './editor-session';
export default function GisData({
  datasets,
  capabilities,
  map,
  mutate,
  refresh,
  onEdit,
  onEndEditingSession,
  active = true,
}: GisPanelProps) {
  const session = useEditorSession();
  const { setState: setSession } = session;
  const id =
    session.state.table.kind === 'dataset' ? session.state.table.id || '' : '';
  const setId = (value: string) =>
    session.setState((s) => ({
      ...s,
      activeEntry: 'dataset:' + value,
      table: { ...s.table, kind: 'dataset', id: value },
    }));
  const dataset = datasets.find((d) => d.id === id) || datasets[0];
  const datasetId = dataset?.id;
  const revision = dataset?.revision;
  const editable = capabilities.capabilities.includes('edit');
  const defaults: TableContext = useMemo(
    () => ({
      query: {},
      columns: dataset?.schema.fields.map((f) => f.name).slice(0, 8) || [],
      revision,
      history: [],
    }),
    [dataset, revision],
  );
  const table = session.state.datasetTables[datasetId || ''] || defaults;
  const changeTable = <K extends keyof TableContext>(
    key: K,
    value: TableContext[K] | ((previous: TableContext[K]) => TableContext[K]),
  ) =>
    session.setState((s) => {
      const previous = s.datasetTables[datasetId || ''] || defaults;
      return {
        ...s,
        datasetTables: {
          ...s.datasetTables,
          [datasetId || '']: {
            ...previous,
            [key]: typeof value === 'function' ? value(previous[key]) : value,
          },
        },
      };
    });
  const query = table.query,
    cursor = table.revision === revision ? table.cursor : undefined,
    history = table.revision === revision ? table.history : [],
    columns = table.columns;
  const setQuery = (
    value:
      | TableContext['query']
      | ((q: TableContext['query']) => TableContext['query']),
  ) => changeTable('query', value);
  const setCursor = (value: string | undefined) => changeTable('cursor', value);
  const setHistory = (
    value:
      | TableContext['history']
      | ((h: TableContext['history']) => TableContext['history']),
  ) => changeTable('history', value);
  const setColumns = (value: string[] | ((c: string[]) => string[])) =>
    changeTable('columns', value);
  const selected = new Set(
    session.state.selection
      .filter((f) => f.datasetId === datasetId)
      .map(selectionKey),
  );
  const setSelected = (
    value: Set<string> | ((s: Set<string>) => Set<string>),
  ) =>
    session.setState((s) => {
      const previous = new Set(
        s.selection.filter((f) => f.datasetId === datasetId).map(selectionKey),
      );
      const next = typeof value === 'function' ? value(previous) : value;
      return {
        ...s,
        editingFeature: undefined,
        selection: [...next]
          .slice(0, 500)
          .map((key) =>
            featureReference(capabilities.campusId, key, datasetId, revision),
          ),
      };
    });
  useEffect(() => {
    if (!datasetId || revision === undefined) return;
    setSession((s) => {
      const previous = s.datasetTables[datasetId];
      if (previous?.revision === revision) return s;
      return {
        ...s,
        datasetTables: {
          ...s.datasetTables,
          [datasetId]: {
            ...(previous || defaults),
            revision,
            cursor: undefined,
            history: [],
          },
        },
      };
    });
  }, [datasetId, revision, setSession, defaults]);
  const [pageResult, setPageResult] = useState<{
    key: string;
    page: FeaturePage;
  }>();
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [extent, setExtent] = useState(false),
    [epoch, setEpoch] = useState(0),
    [name, setName] = useState('Asset table');
  const [field, setField] = useState(''),
    [operator, setOperator] = useState('contains'),
    [value, setValue] = useState(''),
    [stats, setStats] = useState('');
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
  useEffect(() => {
    setField((current) =>
      dataset?.schema.fields.some((f) => f.name === current)
        ? current
        : dataset?.schema.fields[0]?.name || '',
    );
  }, [datasetId, dataset?.schema.fields]);
  useEffect(() => {
    if (!active || !datasetId || revision === undefined) return;
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
  }, [active, datasetId, revision, query, cursor, epoch, requestKey]);
  useEffect(() => {
    if (!active || !map || !extent) return;
    const update = () => {
      const b = map.getBounds();
      setSession((s) => {
        const previous = s.datasetTables[datasetId || ''] || defaults;
        return {
          ...s,
          datasetTables: {
            ...s.datasetTables,
            [datasetId || '']: {
              ...previous,
              cursor: undefined,
              history: [],
              query: {
                ...previous.query,
                bbox: [
                  Math.max(-180, b.getWest()),
                  Math.max(-90, b.getSouth()),
                  Math.min(180, b.getEast()),
                  Math.min(90, b.getNorth()),
                ],
              },
            },
          },
        };
      });
    };
    update();
    map.on('moveend', update);
    return () => {
      map.off('moveend', update);
    };
  }, [map, extent, active, datasetId, defaults, setSession]);
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
  return (
    <>
      {editable && onEndEditingSession && (
        <details>
          <summary>Geometry editing session</summary>
          <p>
            Up to 500 dataset features can join Edit at once. End this session
            to unload saved GIS geometry and clear its undo history. Saved
            changes remain in the shared draft.
          </p>
          <button onClick={() => void attempt(onEndEditingSession)}>
            Save and end geometry session
          </button>
        </details>
      )}
      <div className="gis-toolbar">
        <label>
          Dataset
          <select
            value={dataset?.id || ''}
            onChange={(e) => setId(e.target.value)}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({(d.count || 0).toLocaleString()})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            void attempt(async () => {
              await refresh();
              setEpoch((e) => e + 1);
            })
          }
        >
          Refresh
        </button>
      </div>
      {editable && (
        <details>
          <summary>Import an attribute CSV</summary>
          <p>
            Quoted values and leading-zero identifiers are preserved. Join this
            private table to a spatial dataset in Analyze.
          </p>
          <label>
            Table name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
            />
          </label>
          <input
            aria-label="Import CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void attempt(async () => {
                  if (file.size > 2500000) throw Error('CSV exceeds 2.5 MB.');
                  const csv = await file.text();
                  const created = await mutate(() =>
                    gisApi('gis-csv-import', {
                      name,
                      csv,
                      operationId: crypto.randomUUID(),
                    }),
                  );
                  setId(created.id);
                });
              e.target.value = '';
            }}
          />
        </details>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!dataset ? (
        <p>Import campus features in Campuses, or add an asset CSV above.</p>
      ) : (
        <>
          <details className="gis-table-options">
            <summary>
              Filters and columns{query.filters?.length ? ' · filtered' : ''}
            </summary>
            <p>
              {dataset.source_crs} → {dataset.analysis_crs} · metric analysis in
              metres · revision {dataset.revision} ·{' '}
              {dataset.included
                ? 'Selected for publication'
                : 'Private dataset'}
            </p>
            <div className="gis-toolbar">
              <label>
                Field
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                >
                  {dataset.schema.fields.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Operator
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  {[
                    'contains',
                    'eq',
                    'ne',
                    'gt',
                    'gte',
                    'lt',
                    'lte',
                    'null',
                  ].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label>
                Value
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <button
                onClick={() => {
                  const type = dataset.schema.fields.find(
                    (f) => f.name === field,
                  )?.type;
                  const parsed =
                    value === ''
                      ? null
                      : type === 'number'
                        ? Number(value)
                        : type === 'boolean'
                          ? value === 'true'
                          : value;
                  setQuery((q) => ({
                    ...q,
                    filters: [
                      { field, operator: operator as 'eq', value: parsed },
                    ],
                  }));
                  setCursor(undefined);
                  setHistory([]);
                }}
              >
                Filter
              </button>
              <button
                onClick={() => {
                  setQuery({});
                  setCursor(undefined);
                  setHistory([]);
                  setExtent(false);
                }}
              >
                Clear
              </button>
              <button
                onClick={() =>
                  void attempt(async () => {
                    const s = await gisApi('gis-statistics', {
                      ...query,
                      datasetId: dataset.id,
                      revision: dataset.revision,
                      field,
                    });
                    setStats(
                      `${s.count} rows; ${s.nulls} null; min ${s.min ?? '—'}; max ${s.max ?? '—'}; mean ${s.average ?? '—'}; sum ${s.sum ?? '—'}`,
                    );
                  })
                }
              >
                Statistics
              </button>
            </div>
            {stats && <output>{stats}</output>}
            <div className="gis-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={extent}
                  onChange={(e) => {
                    setExtent(e.target.checked);
                    if (!e.target.checked)
                      setQuery((q) => {
                        const { bbox: _bbox, ...rest } = q;
                        return rest;
                      });
                  }}
                />
                Limit to map extent
              </label>
              <details>
                <summary>Columns</summary>
                {dataset.schema.fields.map((f) => (
                  <label key={f.name}>
                    <input
                      type="checkbox"
                      checked={columns.includes(f.name)}
                      onChange={(e) =>
                        setColumns((c) =>
                          e.target.checked
                            ? [...c, f.name]
                            : c.filter((k) => k !== f.name),
                        )
                      }
                    />
                    {f.alias || f.name}
                  </label>
                ))}
              </details>
              <label>
                Saved filter
                <select
                  value=""
                  onChange={(e) => {
                    const saved = dataset.saved_filters[Number(e.target.value)];
                    if (saved) {
                      const {
                        datasetId: _id,
                        revision: _rev,
                        cursor: _cursor,
                        ...q
                      } = saved.query;
                      setQuery(q);
                      setCursor(undefined);
                      setHistory([]);
                    }
                  }}
                >
                  <option value="">Choose…</option>
                  {dataset.saved_filters.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
          <div className="gis-table-scroll" aria-busy={loading}>
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select this page"
                      checked={
                        !!page?.features.length &&
                        page.features.every((f) => selected.has(f.id))
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            !!page?.features.some((f) => selected.has(f.id)) &&
                            !page?.features.every((f) => selected.has(f.id));
                      }}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(page?.features.map((f) => f.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th>Feature</th>
                  {fields.map((f) => (
                    <th key={f.name}>
                      <button
                        onClick={() => {
                          setQuery((q) => ({
                            ...q,
                            sort: {
                              field: f.name,
                              direction:
                                q.sort?.field === f.name &&
                                q.sort.direction === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            },
                          }));
                          setCursor(undefined);
                          setHistory([]);
                        }}
                      >
                        {f.alias || f.name}
                        {f.unit ? ` (${f.unit})` : ''}
                        {f.required ? ' *' : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page?.features.map((f) => (
                  <tr
                    key={f.id}
                    className={selected.has(f.id) ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={'Select ' + f.id}
                        checked={selected.has(f.id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked && next.size < 500)
                              next.add(f.id);
                            else next.delete(f.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        title={f.id}
                        onClick={() => {
                          setSelected(new Set([f.id]));
                          focusGisFeature(map, f);
                        }}
                      >
                        {String(f.properties.name || f.id).slice(0, 50)}
                      </button>
                      {editable && f.geometry && (
                        <button
                          disabled={loading}
                          onClick={() =>
                            void attempt(async () => {
                              const result = await gisApi('gis-feature', {
                                datasetId: dataset.id,
                                key: f.id,
                                revision: page.revision,
                              });
                              onEdit(result.source, result.edit);
                            })
                          }
                        >
                          Edit geometry
                        </button>
                      )}
                    </td>
                    {fields.map((field) => (
                      <td key={field.name}>
                        <AttributeCell
                          draftKey={attributeInputKey(
                            dataset.id,
                            f.id,
                            field.name,
                          )}
                          revision={page!.revision}
                          key={field.name + ':' + page.revision}
                          field={field}
                          value={f.properties[field.name] ?? null}
                          disabled={!editable || loading}
                          save={(v) => save(f, field, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gis-toolbar">
            <span>
              {page?.total.toLocaleString() || 0} matching · {selected.size}{' '}
              selected · showing at most 100 geometries
            </span>
            <button
              disabled={!history.length || loading || !page}
              onClick={() => {
                setCursor(history.at(-1));
                setHistory((h) => h.slice(0, -1));
              }}
            >
              Previous
            </button>
            <button
              disabled={!page?.nextCursor || loading}
              onClick={() => {
                setHistory((h) => [...h, cursor]);
                setCursor(page?.nextCursor || undefined);
              }}
            >
              Next
            </button>
          </div>
          <details>
            <summary>Export filtered or selected data</summary>
            <p>
              Exports run against this exact revision. A download includes CRS
              and provenance metadata.
            </p>
            <div className="gis-toolbar">
              {['geojson', 'csv', 'gpkg'].map((format) => (
                <button
                  key={format}
                  disabled={!editable || loading}
                  onClick={() =>
                    void attempt(() =>
                      mutate(() =>
                        gisApi('gis-job-start', {
                          operationId: crypto.randomUUID(),
                          tool: 'export',
                          name: dataset.name + ' export',
                          input: {
                            ...query,
                            datasetId: dataset.id,
                            revision: dataset.revision,
                            ...(selected.size ? { keys: [...selected] } : {}),
                          },
                          parameters: { format, crs: 'EPSG:4326' },
                        }),
                      ),
                    )
                  }
                >
                  {format === 'gpkg' ? 'GeoPackage' : format.toUpperCase()}
                </button>
              ))}
            </div>
            <p>Open Analyze to follow the job and download the result.</p>
          </details>
        </>
      )}
    </>
  );
}
function AttributeCell({
  field,
  value,
  disabled,
  save,
  draftKey,
  revision,
}: {
  draftKey: string;
  revision: number;
  field: DatasetField;
  value: FieldValue;
  disabled: boolean;
  save: (value: string) => Promise<void>;
}) {
  const session = useEditorSession();
  const draft = session.state.attributeDrafts[draftKey];
  const text = draft?.text ?? (value === null ? '' : String(value));
  const setText = (text: string) => {
    if (!draft && Object.keys(session.state.attributeDrafts).length >= 500) {
      setError(
        'Finish or discard an unfinished attribute input before adding another.',
      );
      return;
    }
    session.setState((s) => ({
      ...s,
      attributeDrafts: {
        ...s.attributeDrafts,
        [draftKey]: {
          text,
          revision: s.attributeDrafts[draftKey]?.revision ?? revision,
        },
      },
    }));
  };
  const clear = () =>
    session.setState((s) => {
      const next = { ...s.attributeDrafts };
      delete next[draftKey];
      return { ...s, attributeDrafts: next };
    });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const commit = async () => {
    if (!draft || busy || disabled) return;
    if (draft.revision !== revision) {
      setError(
        'The dataset changed. Review the current value before applying this input.',
      );
      return;
    }
    const errors = valueErrors(
      field,
      text === ''
        ? null
        : field.type === 'number'
          ? Number(text)
          : field.type === 'boolean'
            ? text === 'true'
            : text,
    );
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await save(text);
      clear();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choices = field.domain?.length
    ? field.domain
    : field.type === 'boolean'
      ? [true, false]
      : undefined;
  return (
    <>
      {choices ? (
        <select
          aria-label={field.alias || field.name}
          value={text}
          disabled={disabled || busy}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
        >
          <option value="">NULL</option>
          {choices
            .filter((v) => v !== null)
            .map((v) => (
              <option key={String(v)} value={String(v)}>
                {String(v)}
              </option>
            ))}
        </select>
      ) : (
        <input
          aria-label={field.alias || field.name}
          aria-invalid={!!error}
          value={text}
          disabled={disabled || busy}
          placeholder="NULL"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      )}
      {error && <small role="alert">{error}</small>}
      {draft && (
        <span>
          <button type="button" onClick={clear}>
            Discard input
          </button>
          {draft.revision !== revision && (
            <button
              type="button"
              onClick={() => {
                session.setState((s) => ({
                  ...s,
                  attributeDrafts: {
                    ...s.attributeDrafts,
                    [draftKey]: { text, revision },
                  },
                }));
                setError(
                  'Current value: ' +
                    String(value ?? 'NULL') +
                    '. Check your input, then leave the field to save.',
                );
              }}
            >
              Review current value
            </button>
          )}
        </span>
      )}
    </>
  );
}
