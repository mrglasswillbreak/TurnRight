import {
  layerEdit,
  newLayer,
  coreLayer,
  layerErrors,
  editableLayer,
} from './campus-layers';
import type { MapEdit } from './types';
import type { CampusLayer } from './campus-layer-types';
import type { LayerWorkspaceState } from './useLayerWorkspace';
import { LayerStyleSettings } from './LayerStyleSettings';
export function LayerSettings({ state }: { state: LayerWorkspaceState }) {
  const {
    active,
    draft,
    update,
    items,
    descendants,
    setMessage,
    save,
    onZoom,
    rows,
    view,
    onView,
    exportLayer,
    onCommit,
    layerIssues,
    onSelect,
    onDraw,
  } = state;

  return (
    <>
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
            ['editorVisible', 'locked', 'included', 'publishedVisible'] as const
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
            Visibility changes presentation only. It does not grant access or
            remove routing connections. Editor-only overlays are excluded from
            public downloads.
          </p>
          {draft.role !== 'group' && <LayerStyleSettings state={state} />}
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
                  isolated: view.isolated === active.id ? undefined : active.id,
                })
              }
            >
              Isolate temporarily
            </button>
            <button onClick={exportLayer}>Export GeoJSON</button>
            <button
              onClick={() => save([{ ...active, archived: !active.archived }])}
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
                const duplicate = newLayer(`${active.name} copy`, active.role);
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
          {['landcover', 'road-surface', 'overlay'].includes(active.role) && (
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
  );
}
