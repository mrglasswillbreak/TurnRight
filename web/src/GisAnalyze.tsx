import { useEditorSession } from './EditorSession';
import { selectionKey } from './editor-session';
import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  DatasetFeature,
  FeatureQuery,
  ProcessingJob,
  ProcessingTool,
} from './gis-types';
import { gisApi } from './gis-api';
import { processingTools } from './gis-contracts';
import { showGisPage } from './gis-map';
const overlayTools = new Set([
  'clip',
  'intersect',
  'difference',
  'select-location',
  'spatial-join',
  'nearest',
  'summarize-within',
  'attribute-join',
]);
export default function GisAnalyze({
  datasets,
  capabilities,
  map,
  mutate,
}: GisPanelProps) {
  const session = useEditorSession();
  const [search, setSearch] = useState(''),
    [tool, setTool] = useState<ProcessingTool>('buffer'),
    [input, setInput] = useState(
      session.state.table.kind === 'dataset'
        ? session.state.table.id || ''
        : '',
    ),
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
  return (
    <>
      <button
        onClick={() => {
          const id =
            session.state.table.kind === 'dataset'
              ? session.state.table.id
              : undefined;
          if (!id) {
            setError('Choose a dataset in the catalogue first.');
            return;
          }
          setInput(id);
          const selected = session.state.selection
            .filter((f) => f.datasetId === id)
            .map(selectionKey);
          setInputQuery({
            ...session.state.datasetTables[id]?.query,
            ...(selected.length ? { keys: selected } : {}),
          });
        }}
      >
        Use current table filter and selection
      </button>
      <p>
        Metric tools use the input dataset’s validated projected CRS. WGS84
        source coordinates and navigation permissions are preserved. Results
        become private layers after inspection.
      </p>
      <label>
        Search toolbox
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buffer, join, measure…"
        />
      </label>
      <div className="gis-tools">
        {processingTools
          .filter((t) => t.includes(search.toLowerCase()))
          .map((t) => (
            <button
              key={t}
              className={tool === t ? 'active' : ''}
              onClick={() => setTool(t)}
            >
              {t.replaceAll('-', ' ')}
            </button>
          ))}
      </div>
      <div className="gis-toolbar">
        <label>
          Input
          <select
            value={source?.id || ''}
            onChange={(e) => {
              setInput(e.target.value);
              setInputQuery({});
            }}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {overlayTools.has(tool) && (
          <label>
            Overlay / join table
            <select
              value={overlay}
              onChange={(e) => {
                setOverlay(e.target.value);
                setOverlayQuery({});
                setFields([]);
              }}
            >
              <option value="">Choose…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Result name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <p>
        {source?.analysis_crs} · metres · input revision {source?.revision}
        {other ? ` · overlay revision ${other.revision}` : ''}
      </p>
      {(inputQuery.filters?.length ||
        inputQuery.keys?.length ||
        inputQuery.bbox ||
        inputQuery.spatial ||
        overlayQuery.filters?.length ||
        overlayQuery.keys?.length ||
        overlayQuery.bbox ||
        overlayQuery.spatial) && (
        <details open>
          <summary>Retained input selections from processing history</summary>
          <pre>
            {JSON.stringify(
              { input: inputQuery, overlay: overlayQuery },
              null,
              2,
            )}
          </pre>
          <button
            onClick={() => {
              setInputQuery({});
              setOverlayQuery({});
            }}
          >
            Use complete current datasets
          </button>
        </details>
      )}
      {tool === 'buffer' && (
        <label>
          Distance (metres)
          <input
            type="number"
            min={0.01}
            max={100000}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
          />
        </label>
      )}
      {tool === 'select-location' && (
        <label>
          Predicate
          <select
            value={predicate}
            onChange={(e) => setPredicate(e.target.value)}
          >
            {['intersects', 'within', 'disjoint'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      )}
      {tool === 'dissolve' && (
        <label>
          Group by
          <select value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">All features</option>
            {source?.schema.fields.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
      )}
      {tool === 'attribute-join' && (
        <div className="gis-toolbar">
          <label>
            Input key
            <select
              value={inputField}
              onChange={(e) => setInputField(e.target.value)}
            >
              <option value="">Choose…</option>
              {source?.schema.fields.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
          <label>
            Table key
            <select
              value={overlayField}
              onChange={(e) => setOverlayField(e.target.value)}
            >
              <option value="">Choose…</option>
              {other?.schema.fields.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {[
        'attribute-join',
        'spatial-join',
        'intersect',
        'summarize-within',
      ].includes(tool) && (
        <fieldset>
          <legend>Overlay fields (prefixed in output)</legend>
          {other?.schema.fields.map((f) => (
            <label key={f.name}>
              <input
                type="checkbox"
                checked={fields.includes(f.name)}
                onChange={(e) =>
                  setFields((values) =>
                    e.target.checked
                      ? [...values, f.name]
                      : values.filter((v) => v !== f.name),
                  )
                }
              />
              {f.alias || f.name}
            </label>
          ))}
        </fieldset>
      )}
      {tool === 'calculate' && (
        <>
          <label>
            Output field
            <input
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="area_hectares"
            />
          </label>
          <label>
            Expression
            <textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="round(area_m2 / 10000, 2)"
            />
          </label>
          <p>
            Fields, constants, + − × ÷ %, abs, round, min, max, coalesce,
            concat, lower and upper. Null arithmetic reports an error; use
            coalesce explicitly.
          </p>
        </>
      )}
      {tool === 'export' && (
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {['geojson', 'csv', 'gpkg'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        disabled={
          !canEdit || !source || busy || (overlayTools.has(tool) && !other)
        }
        onClick={() =>
          void attempt(() =>
            mutate(() =>
              gisApi('gis-job-start', {
                operationId: crypto.randomUUID(),
                tool,
                name,
                input: {
                  ...inputQuery,
                  datasetId: source!.id,
                  revision: source!.revision,
                },
                ...(overlayTools.has(tool) && other
                  ? {
                      overlay: {
                        ...overlayQuery,
                        datasetId: other.id,
                        revision: other.revision,
                      },
                    }
                  : {}),
                parameters: {
                  distance,
                  field,
                  expression,
                  inputField,
                  overlayField,
                  fields,
                  predicate,
                  format,
                },
              }),
            ),
          )
        }
      >
        Run {tool.replaceAll('-', ' ')}
      </button>
      <h3>Processing history</h3>
      <p>
        Jobs retain the actor, input revisions, parameters, CRS, engine versions
        and diagnostics. Rerun settings uses the current revisions shown above.
      </p>
      {jobs.map((job) => (
        <article key={job.id} className="gis-job">
          <strong>{job.request.name}</strong> · {job.tool} · {job.status}
          <progress value={job.progress} max={100} />
          <p>{job.message}</p>
          <small>
            {new Date(job.created_at).toLocaleString()} · {job.actor} · revision{' '}
            {job.input_revision}
          </small>
          <div className="gis-toolbar">
            <button onClick={() => rerun(job)}>Rerun settings</button>
            {canEdit &&
              ['queued', 'running', 'succeeded'].includes(job.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void attempt(() =>
                      mutate(() => gisApi('gis-job-cancel', { id: job.id })),
                    )
                  }
                >
                  Cancel
                </button>
              )}
            {job.status === 'succeeded' && job.tool !== 'export' && (
              <button
                disabled={busy}
                onClick={() =>
                  void attempt(async () => {
                    setPreview({
                      id: job.id,
                      features: await gisApi('gis-job-preview', { id: job.id }),
                    });
                    setReviewed(false);
                  })
                }
              >
                Inspect staged output
              </button>
            )}
            {job.artifact && (
              <button
                onClick={() => {
                  const download = window.open('', '_blank');
                  if (!download) {
                    setError('Allow the download window to open this export.');
                    return;
                  }
                  download.opener = null;
                  void attempt(async () => {
                    try {
                      const result = await gisApi('gis-job-artifact', {
                        id: job.id,
                      });
                      download.location.replace(result.url);
                    } catch (error) {
                      download.close();
                      throw error;
                    }
                  });
                }}
              >
                Download export
              </button>
            )}
          </div>
          <details>
            <summary>Parameters and engine</summary>
            <pre>
              {JSON.stringify(
                {
                  request: job.request,
                  engine: job.engine,
                  output: job.output_dataset_id,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {preview?.id === job.id && (
            <>
              <p>
                Map preview: first {preview.features.length} output features.
                All output features are validated before committing.
              </p>
              <details>
                <summary>Output attributes</summary>
                <pre>
                  {JSON.stringify(
                    preview.features.slice(0, 5).map((f) => f.properties),
                    null,
                    2,
                  )}
                </pre>
              </details>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I inspected the result and diagnostics
              </label>
              <button
                disabled={!canEdit || !reviewed || busy}
                onClick={() =>
                  void attempt(() =>
                    mutate(async () => {
                      const result = await gisApi('gis-job-apply', {
                        id: job.id,
                      });
                      session.setState((s) => ({
                        ...s,
                        activeEntry: 'dataset:' + result.datasetId,
                        table: {
                          open: true,
                          kind: 'dataset',
                          id: result.datasetId,
                        },
                        datasetVisibility: [
                          ...new Set([
                            ...s.datasetVisibility,
                            result.datasetId,
                          ]),
                        ].slice(-5),
                      }));
                      return result;
                    }),
                  )
                }
              >
                Apply as private layer
              </button>
            </>
          )}
        </article>
      ))}
    </>
  );
}
