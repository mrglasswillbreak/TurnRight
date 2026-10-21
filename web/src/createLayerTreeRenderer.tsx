import { roleName } from './campus-layers';
import type { CampusLayer } from './campus-layer-types';
import type { LayerWorkspaceState } from './useLayerWorkspace';
export function createLayerTreeRenderer({
  view,
  items,
  descendants,
  setMessage,
  save,
  onView,
  layerStats,
  edits,
  layerIssues,
}: Pick<
  LayerWorkspaceState,
  | 'view'
  | 'items'
  | 'descendants'
  | 'setMessage'
  | 'save'
  | 'onView'
  | 'layerStats'
  | 'edits'
  | 'layerIssues'
>): (layer: CampusLayer, depth?: number) => import('react').ReactNode {
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
                : `${roleName(layer.role)} · ${layerStats.get(layer.id)?.count || 0}`}{' '}
              {layer.archived ? '· Archived' : ''}{' '}
              {edits.some((e) => e.kind === 'layer' && e.id === layer.id)
                ? '· Edited'
                : ''}
              {(layerIssues.get(layer.id)?.length || 0) > 0
                ? ` · ${layerIssues.get(layer.id)!.length} issues`
                : ''}
            </small>
            <small>
              {[...(layerStats.get(layer.id)?.geometry || [])].join(' · ')}
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
  return row;
}
