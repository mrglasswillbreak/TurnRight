import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import { focusGisFeature } from './gis-map';
import { AttributeCell } from './GisAttributeCell';
import type { GisDataState } from './useGisData';

export function GisAttributeTable({
  state: viewState,
}: {
  state: GisDataState;
}) {
  const {
    dataset,
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
    attempt,
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
    editable,
    onEdit,
    save,
    history,
    cursor,
  } = viewState;
  if (!dataset) return null;

  return (
    <WorkspacePane
      id="bottom"
      title="Attributes"
      className="gis-pane gis-workspace"
    >
      <p>
        {dataset.source_crs} → {dataset.analysis_crs} · metric analysis in
        metres · revision {dataset.revision} ·{' '}
        {dataset.included ? 'Selected for publication' : 'Private dataset'}
      </p>
      <div className="gis-toolbar">
        <label>
          Field
          <select value={field} onChange={(e) => setField(e.target.value)}>
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
            {['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'null'].map(
              (o) => (
                <option key={o}>{o}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Value
          <input value={value} onChange={(e) => setValue(e.target.value)} />
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
              filters: [{ field, operator: operator as 'eq', value: parsed }],
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
              <tr key={f.id} className={selected.has(f.id) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={'Select ' + f.id}
                    checked={selected.has(f.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked && next.size < 500) next.add(f.id);
                        else next.delete(f.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td>
                  <button title={f.id} onClick={() => focusGisFeature(map, f)}>
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
    </WorkspacePane>
  );
}
