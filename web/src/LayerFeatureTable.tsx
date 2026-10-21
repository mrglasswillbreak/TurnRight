import { WorkspacePane } from './WorkspaceFrame';
import { roleName } from './campus-layers';
import { BUILDING_PRESETS, type BuildingPreset } from './building-presets';
import type { LayerWorkspaceState } from './useLayerWorkspace';
import type { MapEdit } from './types';
import type { LayerRole } from './campus-layer-types';

function featureRoleForRow(kind: MapEdit['kind'] | 'boundary'): LayerRole {
  return kind === 'land' ? 'landcover' : kind === 'layer' ? 'group' : kind;
}

export function LayerFeatureTable({ state }: { state: LayerWorkspaceState }) {
  const {
    explorerTab,
    active,
    staleCount,
    rows,
    featureSearch,
    featureQuery,
    setFeatureQuery,
    selectedKeys,
    setSelected,
    selected,
    table,
    setScroll,
    first,
    last,
    onZoom,
    onSelect,
    preset,
    setPreset,
    setPending,
    previewAppearance,
    bulk,
    setBulk,
    previewBulk,
    moveTarget,
    setMoveTarget,
    items,
    move,
    selectionEditable,
    onGeometry,
    pending,
    previewPanel,
    pendingLabel,
    pendingBase,
    data,
    edits,
    onCommit,
    message,
  } = state;

  return (
    <>
      {explorerTab === 'features' && (
        <WorkspacePane
          id="bottom"
          title="Layer attributes"
          className="layer-attributes-pane"
        >
          <p>
            {active?.name || 'All campus layers'} · {staleCount} surfaces need
            regeneration
          </p>
          <div className="layer-feature-heading">
            <h3>Features · {rows.length}</h3>
            <input
              ref={featureSearch}
              aria-label="Search layer features"
              placeholder="Name, original ID or class"
              value={featureQuery}
              onChange={(e) => {
                setFeatureQuery(e.target.value);
              }}
            />
          </div>
          <label className="layer-check">
            <input
              type="checkbox"
              checked={
                !!rows.length &&
                rows.slice(0, 500).every((f) => selectedKeys.has(f.key))
              }
              ref={(input) => {
                if (input)
                  input.indeterminate =
                    rows.slice(0, 500).some((f) => selectedKeys.has(f.key)) &&
                    !rows.slice(0, 500).every((f) => selectedKeys.has(f.key));
              }}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? rows.slice(0, 500).map((f) => f.key) : [],
                )
              }
            />
            Select shown results (up to 500) · {selected.length} selected
          </label>
          <div
            className="layer-table"
            ref={table}
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
          >
            <table
              aria-label="Layer attributes"
              aria-rowcount={rows.length + 1}
              style={{ width: '100%' }}
            >
              <thead>
                <tr>
                  <th aria-label="Selection" />
                  <th>Name / identity</th>
                  <th>Class</th>
                  <th>Width</th>
                  <th>Surface</th>
                </tr>
              </thead>
              <tbody
                style={{
                  height: rows.length * 44,
                  position: 'relative',
                  display: 'block',
                }}
              >
                {rows.slice(first, last).map((f, i) => (
                  <tr
                    aria-rowindex={first + i + 2}
                    key={f.key}
                    className="layer-feature-row"
                    style={{
                      position: 'absolute',
                      top: (first + i) * 44,
                      height: 44,
                      left: 0,
                      right: 0,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${String(f.properties.name || f.kind)} ${String(f.properties.sourceId || f.id)}`}
                        checked={selectedKeys.has(f.key)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, f.key]
                              : s.filter((k) => k !== f.key),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        aria-label={`Edit ${String(f.properties.name || f.kind)} · ${String(f.properties.sourceId || f.id)}`}
                        onClick={() =>
                          f.kind === 'boundary'
                            ? onZoom([f.key])
                            : onSelect(f.kind, f.id)
                        }
                      >
                        <strong>
                          {String(
                            f.properties.name ||
                              roleName(featureRoleForRow(f.kind)),
                          )}
                        </strong>
                        <small>
                          {String(f.properties.sourceId || f.id)} ·{' '}
                          {f.geometry.type} ·{' '}
                          {String(
                            f.properties.surface ||
                              f.properties.landClass ||
                              f.kind,
                          )}
                        </small>
                      </button>
                    </td>
                    <td
                      title={String(
                        f.properties.landClass ||
                          f.properties.highway ||
                          f.kind,
                      )}
                    >
                      {String(
                        f.properties.landClass ||
                          f.properties.highway ||
                          f.kind,
                      )}
                    </td>
                    <td title={String(f.properties.widthEvidence || '')}>
                      {f.properties.width == null
                        ? '—'
                        : `${Number(f.properties.width).toFixed(1)} m`}
                    </td>
                    <td title={String(f.properties.surface || '')}>
                      {String(f.properties.surface || 'Unknown')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!selected.length && (
            <details open>
              <summary>Selected features</summary>
              <div className="layer-actions">
                <label>
                  Building palette
                  <select
                    value={preset}
                    onChange={(e) => {
                      setPreset(e.target.value as BuildingPreset);
                      setPending(null);
                    }}
                  >
                    {Object.entries(BUILDING_PRESETS).map(([id, value]) => (
                      <option key={id} value={id}>
                        {value.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={previewAppearance}>Preview appearance</button>
              </div>
              <div className="layer-actions">
                <select
                  aria-label="Bulk field"
                  value={bulk.field}
                  onChange={(e) => setBulk({ ...bulk, field: e.target.value })}
                >
                  {['name', 'surface', 'highway', 'landClass', 'width'].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
                <input
                  aria-label="Bulk value"
                  value={bulk.value}
                  onChange={(e) => setBulk({ ...bulk, value: e.target.value })}
                />
                <button onClick={previewBulk}>Preview bulk edit</button>
              </div>
              <div className="layer-actions">
                <select
                  aria-label="Move to layer"
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                >
                  <option value="">Move to layer…</option>
                  {items
                    .filter((l) => l.role !== 'group')
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
                <button onClick={move}>Preview move</button>
              </div>
              <div className="layer-actions">
                {(
                  [
                    'merge',
                    'split',
                    'hole',
                    'regenerate',
                    'square',
                    'straighten',
                    'align',
                    'offset',
                  ] as const
                ).map((op) => (
                  <button
                    key={op}
                    onClick={() => {
                      if (selectionEditable()) onGeometry(op, selected);
                    }}
                  >
                    {op === 'hole'
                      ? 'Add / remove hole'
                      : op === 'regenerate'
                        ? 'Rebuild road surfaces'
                        : op}
                  </button>
                ))}
              </div>
            </details>
          )}
          {pending && (
            <div
              ref={previewPanel}
              tabIndex={-1}
              role="alert"
              className="layer-preview"
            >
              <strong>
                Review {pending.length}{' '}
                {pending.length === 1 ? 'change' : 'changes'} affecting{' '}
                {selected.length}{' '}
                {selected.length === 1 ? 'feature' : 'features'}
              </strong>
              <p>
                {pendingLabel ||
                  (pending[0]?.kind === 'layer'
                    ? 'Move membership without changing geometry or source identities.'
                    : `${bulk.field}: ${bulk.value}. This operation can be undone as one command.`)}
              </p>
              {pendingLabel && (
                <div
                  aria-label="Proposed building colours"
                  style={{ display: 'flex', gap: 12 }}
                >
                  {Object.entries(BUILDING_PRESETS[preset].style).map(
                    ([name, colour]) => (
                      <span
                        key={name}
                        style={{ borderBottom: `12px solid ${colour}` }}
                      >
                        {name.replace('Colour', '')}
                      </span>
                    ),
                  )}
                </div>
              )}
              <button
                className="editor-primary"
                disabled={
                  pendingBase?.data !== data || pendingBase?.edits !== edits
                }
                onClick={() => {
                  if (
                    pendingBase?.data === data &&
                    pendingBase?.edits === edits &&
                    selectionEditable()
                  ) {
                    onCommit(pending);
                    setPending(null);
                  }
                }}
              >
                Apply changes
              </button>
              {(pendingBase?.data !== data || pendingBase?.edits !== edits) && (
                <p>The workspace changed. Preview again before applying.</p>
              )}
              <button onClick={() => setPending(null)}>Cancel</button>
            </div>
          )}
          {message && <output>{message}</output>}
        </WorkspacePane>
      )}
    </>
  );
}
