import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import { overlayTools } from './gis-overlay-tools';
import type { GisAnalysisState } from './useGisAnalysis';

export function GisAnalysisParameters({
  state: viewState,
}: {
  state: GisAnalysisState;
}) {
  const {
    source,
    setInput,
    setInputQuery,
    datasets,
    tool,
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
  } = viewState;

  return (
    <WorkspacePane
      id="right"
      title="Parameters"
      className="gis-pane gis-workspace"
    >
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
    </WorkspacePane>
  );
}
