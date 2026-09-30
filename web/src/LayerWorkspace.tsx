import { useEffect, useMemo, useState } from 'react';
import {
  campusLayers,
  layerFeatures,
  layerMembership,
  layerEdit,
  newLayer,
  layerRoles,
  roleName,
  coreLayer,
  layerErrors,
  editableLayer,
} from './campus-layers';
import type { CampusData, MapEdit } from './types';
import type {
  CampusLayer,
  LayerViewState,
  LayerStyle,
  LayerRole,
} from './campus-layer-types';
import { featureEdit } from './editor-features';
import { surfaceStale } from './surface-generation';
import { propertyEdits } from './road-properties';
import './layer-workspace.css';

export default function LayerWorkspace({
  data,
  issues,
  edits,
  view,
  onView,
  onCommit,
  onSelect,
  onZoom,
  onImport,
  onDraw,
  onGeometry,
  onClose,
}: {
  data: CampusData;
  issues: import('./validation').ValidationIssue[];
  edits: MapEdit[];
  view: LayerViewState;
  onView: (value: LayerViewState) => void;
  onCommit: (edits: MapEdit[]) => void;
  onSelect: (kind: MapEdit['kind'], id: string) => void;
  onZoom: (ids: string[]) => void;
  onImport: () => void;
  onDraw: (
    layer: CampusLayer,
    type: 'Point' | 'LineString' | 'Polygon',
  ) => void;
  onGeometry: (
    operation: 'merge' | 'split' | 'hole' | 'regenerate',
    keys: string[],
  ) => void;
  onClose: () => void;
}) {
  const items = useMemo(() => campusLayers(data).items, [data]),
    features = useMemo(() => layerFeatures(data), [data]),
    membership = useMemo(() => layerMembership(data, items), [data, items]);
  const active = items.find((l) => l.id === view.active);
  const layerIssues = useMemo(() => {
    const result = new Map<string, import('./validation').ValidationIssue[]>();
    for (const issue of issues) {
      const id = membership.get(`${issue.featureKind}:${issue.featureId}`);
      if (id) result.set(id, [...(result.get(id) || []), issue]);
    }
    return result;
  }, [issues, membership]);
  const [explorerTab, setExplorerTab] = useState<'layers' | 'features'>(
    'layers',
  );
  const [draft, setDraft] = useState<CampusLayer | null>(null),
    [query, setQuery] = useState(''),
    [featureQuery, setFeatureQuery] = useState(''),
    [scroll, setScroll] = useState(0),
    [message, setMessage] = useState('');
  const [createName, setCreateName] = useState(''),
    [createRole, setCreateRole] = useState<LayerRole>('overlay'),
    [bulk, setBulk] = useState({ field: 'surface', value: '' }),
    [pending, setPending] = useState<MapEdit[] | null>(null),
    [pendingBase, setPendingBase] = useState<{
      data: CampusData;
      edits: MapEdit[];
    } | null>(null),
    [moveTarget, setMoveTarget] = useState('');
  const selected = view.selected || [];
  const setSelected = (value: string[] | ((current: string[]) => string[])) =>
    onView({
      ...view,
      selected: typeof value === 'function' ? value(selected) : value,
    });
  useEffect(() => {
    setDraft(active ? structuredClone(active) : null);
    setScroll(0);
    setMessage('');
  }, [active]);
  const descendants = (id: string): string[] => [
    id,
    ...items.filter((l) => l.parentId === id).flatMap((l) => descendants(l.id)),
  ];
  const activeIds = new Set(active ? descendants(active.id) : []);
  const rows = features.filter(
    (f) =>
      (!active || activeIds.has(membership.get(f.key) || '')) &&
      `${f.properties.name || ''} ${f.id} ${f.properties.sourceId || ''} ${f.properties.surface || ''} ${f.properties.landClass || ''}`
        .toLowerCase()
        .includes(featureQuery.toLowerCase()),
  );
  const save = (layers: CampusLayer[]) =>
    onCommit(
      layers.map((l) =>
        layerEdit(
          l,
          edits.find((e) => e.kind === 'layer' && e.id === l.id),
        ),
      ),
    );
  const update = (patch: Partial<CampusLayer>) =>
    setDraft((d) => (d ? { ...d, ...patch } : null));
  const style = (patch: Partial<LayerStyle>) =>
    setDraft((d) => (d ? { ...d, style: { ...d.style, ...patch } } : null));
  const previewBulk = () => {
    if (!selectionEditable()) return;
    const changes = selected
      .map((key) => features.find((f) => f.key === key))
      .filter(
        (f): f is import('./campus-layers').LayerFeature =>
          !!f && f.kind !== 'boundary',
      )
      .map((f) => featureEdit(data, f.kind as MapEdit['kind'], f.id, edits))
      .filter((e) => !!e);
    if (changes.length > 500) {
      setMessage('Select up to 500 features per atomic edit.');
      return;
    }
    if (!changes.length) return;
    const unsupported = changes.some(
      (e) =>
        ['surface', 'landClass', 'highway', 'width'].includes(bulk.field) &&
        !['land', 'overlay', 'path'].includes(e.kind),
    );
    if (unsupported) {
      setMessage(
        'These road/land fields apply only to paths, landscape and overlays.',
      );
      return;
    }
    const batch = propertyEdits(
      data,
      edits,
      changes,
      bulk.field,
      bulk.field === 'width' ? Number(bulk.value) : bulk.value,
    );
    if (batch.length > 500) {
      setMessage(
        'Linked roads bring this operation above 500 changes. Select fewer features.',
      );
      return;
    }
    setPendingBase({ data, edits });
    setPending(batch);
  };
  const selectionEditable = () => {
    if (selected.includes('boundary:campus-boundary')) {
      setMessage(
        'The campus boundary is managed in Campus settings. Select only editable feature rows.',
      );
      return false;
    }
    if (
      selected.some((key) => {
        const l = items.find((l) => l.id === membership.get(key));
        return l && !editableLayer(l, items);
      })
    ) {
      setMessage('Show and unlock all selected layers before editing.');
      return false;
    }
    return true;
  };
  const exportLayer = () => {
    const allowed = new Set([
      'id',
      'kind',
      'name',
      'sourceId',
      'importLayer',
      'mapLayerId',
      'highway',
      'surface',
      'width',
      'widthEvidence',
      'widthSource',
      'landClass',
      'landUse',
      'vegetation',
      'label',
      'color',
      'opacity',
      'height',
      'floors',
    ]);
    const content = {
      type: 'FeatureCollection',
      name: active?.name || 'Campus layers',
      attribution: data.sources.map((s) => ({
        name: s.name,
        attribution: s.attribution,
        license: s.license,
      })),
      features: rows.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: Object.fromEntries(
          Object.entries(f.properties).filter(([key]) => allowed.has(key)),
        ),
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(content)], { type: 'application/geo+json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(active?.name || 'campus-layers').replace(/[^\w.-]+/g, '-')}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const move = () => {
    if (!selectionEditable()) return;
    const target = items.find((l) => l.id === moveTarget);
    if (!target || !editableLayer(target, items)) {
      setMessage('Select an editable target layer.');
      return;
    }
    const keys = new Set(selected);
    const changed = items
      .filter((l) => l.members.some((k) => keys.has(k)) || l.id === target.id)
      .map((l) => ({
        ...l,
        members:
          l.id === target.id
            ? [...new Set([...l.members, ...selected])]
            : l.members.filter((k) => !keys.has(k)),
      }));
    setPendingBase({ data, edits });
    setPending(
      changed.map((l) =>
        layerEdit(
          l,
          edits.find((e) => e.kind === 'layer' && e.id === l.id),
        ),
      ),
    );
  };
  const row = (layer: CampusLayer, depth = 0) => (
    <div
      key={layer.id}
      role="treeitem"
      aria-selected={view.active === layer.id}
      aria-label={layer.name}
    >
      <div
        className={`layer-row ${view.active === layer.id ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', layer.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = items.find(
            (l) => l.id === e.dataTransfer.getData('text/plain'),
          );
          if (!from || from.id === layer.id) return;
          if (layer.role === 'group') {
            if (descendants(from.id).includes(layer.id)) {
              setMessage('Folders cannot contain themselves.');
              return;
            }
            save([{ ...from, parentId: layer.id }]);
          } else if (from.band === layer.band)
            save([
              { ...from, order: layer.order - 1, parentId: layer.parentId },
            ]);
          else setMessage('Reorder within the same cartographic band.');
        }}
      >
        <input
          type="checkbox"
          aria-label={`Show ${layer.name} while editing`}
          checked={layer.editorVisible}
          onChange={(e) =>
            save([{ ...layer, editorVisible: e.target.checked }])
          }
        />
        <button
          className="layer-title"
          aria-label={`${layer.name} · ${roleName(layer.role)}`}
          onClick={() => onView({ ...view, active: layer.id, selected: [] })}
        >
          <i style={{ background: layer.style.color || '#78968b' }} />
          <span>
            <strong>{layer.name}</strong>
            <small>
              {layer.role === 'group'
                ? 'Folder'
                : `${roleName(layer.role)} · ${features.filter((f) => membership.get(f.key) === layer.id).length}`}{' '}
              {layer.archived ? '· Archived' : ''}{' '}
              {edits.some((e) => e.kind === 'layer' && e.id === layer.id)
                ? '· Edited'
                : ''}
              {(layerIssues.get(layer.id)?.length || 0) > 0
                ? ` · ${layerIssues.get(layer.id)!.length} issues`
                : ''}
            </small>
            <small>
              {[
                ...new Set(
                  features
                    .filter((f) => membership.get(f.key) === layer.id)
                    .map((f) => f.geometry.type),
                ),
              ].join(' · ')}
            </small>
          </span>
        </button>
        <button
          aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
          aria-pressed={layer.locked}
          onClick={() => save([{ ...layer, locked: !layer.locked }])}
        >
          {layer.locked ? '🔒' : '○'}
        </button>
      </div>
      {items
        .filter((l) => l.parentId === layer.id)
        .map((l) => row(l, depth + 1))}
    </div>
  );
  const first = Math.max(0, Math.floor(scroll / 44) - 4),
    last = Math.min(rows.length, first + 22);
  return (
    <section className="layer-workspace editor-card" aria-label="Campus layers">
      <header>
        <h2>Layers</h2>
        <button onClick={onClose} aria-label="Close layers">
          ×
        </button>
      </header>
      <div
        className="layer-explorer-tabs"
        role="tablist"
        aria-label="Layer explorer"
      >
        <button
          role="tab"
          aria-selected={explorerTab === 'layers'}
          onClick={() => setExplorerTab('layers')}
        >
          Layers
        </button>
        <button
          role="tab"
          aria-selected={explorerTab === 'features'}
          onClick={() => setExplorerTab('features')}
        >
          Features ({rows.length})
        </button>
      </div>
      <div className="layer-actions">
        <button onClick={onImport}>Import / sources</button>
        <button
          onClick={() => onView({ ...view, isolated: undefined, hidden: [] })}
        >
          Clear temporary isolation
        </button>
      </div>
      {explorerTab === 'layers' && (
        <>
          <input
            aria-label="Search layers"
            placeholder="Search layers or sources"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="layer-tree"
            role="tree"
            aria-label="Campus layer tree"
          >
            {items
              .filter(
                (l) =>
                  !l.parentId &&
                  descendants(l.id).some((id) => {
                    const child = items.find((c) => c.id === id)!;
                    return `${child.name} ${child.sourceName || ''}`
                      .toLowerCase()
                      .includes(query.toLowerCase());
                  }),
              )
              .map((l) => row(l))}
          </div>
          <details>
            <summary>Create layer or folder</summary>
            <input
              aria-label="New layer name"
              placeholder="Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <select
              aria-label="New layer role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as LayerRole)}
            >
              {layerRoles
                .filter(
                  (r) =>
                    ![
                      'boundary',
                      'closure',
                      'entrance',
                      'building',
                      'place',
                      'path',
                      'barrier',
                    ].includes(r),
                )
                .map((r) => (
                  <option key={r} value={r}>
                    {roleName(r)}
                  </option>
                ))}
            </select>
            <button
              disabled={!createName.trim()}
              onClick={() => {
                const l = newLayer(createName.trim(), createRole);
                save([l]);
                onView({ ...view, active: l.id });
                setCreateName('');
              }}
            >
              Create
            </button>
          </details>
          {active && draft && (
            <details open className="layer-settings">
              <summary>{active.name} · settings</summary>
              <label>
                Name
                <input
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                Folder
                <select
                  value={draft.parentId || ''}
                  onChange={(e) =>
                    update({ parentId: e.target.value || undefined })
                  }
                >
                  <option value="">Top level</option>
                  {items
                    .filter(
                      (l) =>
                        l.role === 'group' &&
                        !descendants(active.id).includes(l.id),
                    )
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Drawing order
                <input
                  type="number"
                  value={draft.order}
                  min="-10000"
                  max="10000"
                  onChange={(e) => update({ order: Number(e.target.value) })}
                />
              </label>
              <small>
                Band: {draft.band}. Routes and guidance stay above map content.
              </small>
              {draft.role === 'overlay' && (
                <label>
                  Cartographic band
                  <select
                    value={draft.band}
                    onChange={(e) =>
                      update({ band: e.target.value as CampusLayer['band'] })
                    }
                  >
                    {['landscape', 'surfaces', 'buildings', 'annotations'].map(
                      (b) => (
                        <option key={b}>{b}</option>
                      ),
                    )}
                  </select>
                </label>
              )}
              {(
                [
                  'editorVisible',
                  'locked',
                  'included',
                  'publishedVisible',
                ] as const
              ).map((key, i) => (
                <label key={key} className="layer-check">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    disabled={key === 'included' && coreLayer(draft)}
                    onChange={(e) => update({ [key]: e.target.checked })}
                  />
                  {
                    [
                      'Show while editing',
                      'Lock editing',
                      'Include in release',
                      'Published visibility',
                    ][i]
                  }
                </label>
              ))}
              <p className="small-note">
                Visibility changes presentation only. It does not grant access
                or remove routing connections. Editor-only overlays are excluded
                from public downloads.
              </p>
              {draft.role !== 'group' && (
                <fieldset>
                  <legend>Style</legend>
                  <div className="layer-style-grid">
                    {(['color', 'darkColor', 'outline'] as const).map((k) => (
                      <label key={k}>
                        {k}
                        <input
                          type="color"
                          value={draft.style[k] || '#78968b'}
                          onChange={(e) => style({ [k]: e.target.value })}
                        />
                      </label>
                    ))}
                    {(
                      [
                        'opacity',
                        'lineWidth',
                        'pointSize',
                        'minZoom',
                        'maxZoom',
                      ] as const
                    ).map((k) => (
                      <label key={k}>
                        {k}
                        <input
                          type="number"
                          step={k === 'opacity' ? 0.1 : 1}
                          min="0"
                          value={draft.style[k] ?? ''}
                          placeholder="Default"
                          onChange={(e) =>
                            style({
                              [k]: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Point symbol
                    <select
                      value={draft.style.symbol || 'circle'}
                      onChange={(e) =>
                        style({
                          symbol: e.target.value as LayerStyle['symbol'],
                        })
                      }
                    >
                      {['circle', 'square', 'diamond'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label field
                    <select
                      value={draft.style.labelField || 'name'}
                      onChange={(e) =>
                        style({
                          labelField: e.target
                            .value as LayerStyle['labelField'],
                        })
                      }
                    >
                      {[
                        'name',
                        'label',
                        'sourceId',
                        'landClass',
                        'surface',
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="layer-check">
                    <input
                      type="checkbox"
                      checked={
                        draft.style.labels ??
                        ['overlay', 'path', 'place', 'entrance'].includes(
                          draft.role,
                        )
                      }
                      onChange={(e) => style({ labels: e.target.checked })}
                    />
                    Show labels
                  </label>
                  <details>
                    <summary>
                      Classification rules ({draft.rules.length})
                    </summary>
                    {draft.rules.map((r, i) => (
                      <div key={i} className="layer-rule">
                        <select
                          aria-label={`Rule ${i + 1} field`}
                          value={r.field}
                          onChange={(e) =>
                            update({
                              rules: draft.rules.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      field: e.target.value as typeof r.field,
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          {[
                            'landClass',
                            'surface',
                            'highway',
                            'vegetation',
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          aria-label={`Rule ${i + 1} value`}
                          value={r.value}
                          onChange={(e) =>
                            update({
                              rules: draft.rules.map((x, j) =>
                                j === i ? { ...x, value: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={`Rule ${i + 1} colour`}
                          type="color"
                          value={r.style.color || '#78968b'}
                          onChange={(e) =>
                            update({
                              rules: draft.rules.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      style: {
                                        ...x.style,
                                        color: e.target.value,
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                        <button
                          aria-label={`Remove rule ${i + 1}`}
                          onClick={() =>
                            update({
                              rules: draft.rules.filter((_, j) => j !== i),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      disabled={draft.rules.length >= 50}
                      onClick={() =>
                        update({
                          rules: [
                            ...draft.rules,
                            { field: 'landClass', value: '', style: {} },
                          ],
                        })
                      }
                    >
                      Add rule
                    </button>
                  </details>
                  <button onClick={() => update({ style: {}, rules: [] })}>
                    Reset to campus theme
                  </button>
                </fieldset>
              )}
              <button
                className="editor-primary"
                onClick={() => {
                  const errors = layerErrors(draft);
                  if (errors.length) {
                    setMessage(errors.join(' '));
                    return;
                  }
                  save([draft]);
                  setMessage('Layer settings saved as a private draft.');
                }}
              >
                Apply layer settings
              </button>
              <div className="layer-actions">
                <button onClick={() => onZoom(rows.map((f) => f.key))}>
                  Zoom to layer
                </button>
                <button
                  aria-pressed={view.isolated === active.id}
                  onClick={() =>
                    onView({
                      ...view,
                      isolated:
                        view.isolated === active.id ? undefined : active.id,
                    })
                  }
                >
                  Isolate temporarily
                </button>
                <button onClick={exportLayer}>Export GeoJSON</button>
                <button
                  onClick={() =>
                    save([{ ...active, archived: !active.archived }])
                  }
                >
                  {active.archived ? 'Restore layer' : 'Archive layer'}
                </button>
                <button
                  disabled={
                    active.role === 'group' ||
                    coreLayer(active) ||
                    rows.length > 499
                  }
                  onClick={() => {
                    const duplicate = newLayer(
                      `${active.name} copy`,
                      active.role,
                    );
                    const copies = rows
                      .filter((f) => f.kind !== 'boundary')
                      .map((f) => ({
                        id: `layer-copy:${crypto.randomUUID()}`,
                        kind: f.kind as MapEdit['kind'],
                        geometry: structuredClone(f.geometry),
                        properties: {
                          ...f.properties,
                          mapLayerId: duplicate.id,
                          mapLayerSource: 'owner',
                          geometryLineage: {
                            operation: 'duplicate',
                            parents: [f.key],
                          },
                        },
                      }));
                    duplicate.members = copies.map((e) => `${e.kind}:${e.id}`);
                    onCommit([
                      layerEdit({
                        ...duplicate,
                        style: active.style,
                        rules: active.rules,
                      }),
                      ...copies,
                    ]);
                  }}
                >
                  Duplicate layer
                </button>
              </div>
              <small>
                Source: {active.sourceName || 'Owner-created'}{' '}
                {active.importedLayer ? ` / ${active.importedLayer}` : ''}
              </small>
              {!!layerIssues.get(active.id)?.length && (
                <details>
                  <summary>
                    Layer issues ({layerIssues.get(active.id)!.length})
                  </summary>
                  {layerIssues.get(active.id)!.map((issue, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        issue.featureKind &&
                        issue.featureId &&
                        onSelect(issue.featureKind, issue.featureId)
                      }
                    >
                      {issue.message}
                    </button>
                  ))}
                </details>
              )}
              {['landcover', 'road-surface', 'overlay'].includes(
                active.role,
              ) && (
                <div className="layer-actions">
                  {(active.role === 'overlay'
                    ? (['Point', 'LineString', 'Polygon'] as const)
                    : (['Polygon'] as const)
                  ).map((type) => (
                    <button
                      key={type}
                      disabled={!editableLayer(active, items)}
                      onClick={() => onDraw(active, type)}
                    >
                      Draw {type === 'LineString' ? 'line' : type.toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </details>
          )}
        </>
      )}
      {explorerTab === 'features' && (
        <>
          <p>
            {active?.name || 'All campus layers'} ·{' '}
            {
              rows.filter((f) => surfaceStale(f.properties, data.map.features))
                .length
            }{' '}
            surfaces need regeneration
          </p>
          <div className="layer-feature-heading">
            <h3>Features · {rows.length}</h3>
            <input
              aria-label="Search layer features"
              placeholder="Name, original ID or class"
              value={featureQuery}
              onChange={(e) => {
                setFeatureQuery(e.target.value);
                setScroll(0);
              }}
            />
          </div>
          <label className="layer-check">
            <input
              type="checkbox"
              checked={
                !!rows.length && rows.every((f) => selected.includes(f.key))
              }
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
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
          >
            <table
              aria-label="Layer attributes"
              aria-rowcount={rows.length}
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
                    aria-rowindex={first + i + 1}
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
                        checked={selected.includes(f.key)}
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
                {(['merge', 'split', 'hole', 'regenerate'] as const).map(
                  (op) => (
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
                  ),
                )}
              </div>
            </details>
          )}
        </>
      )}
      {pending && (
        <div role="alert" className="layer-preview">
          <strong>
            Review {pending.length} changes affecting {selected.length} features
          </strong>
          <p>
            {pending[0]?.kind === 'layer'
              ? 'Move membership without changing geometry or source identities.'
              : `${bulk.field}: ${bulk.value}. This operation can be undone as one command.`}
          </p>
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
    </section>
  );
}
function featureRoleForRow(kind: MapEdit['kind'] | 'boundary'): LayerRole {
  return kind === 'land' ? 'landcover' : kind === 'layer' ? 'group' : kind;
}
