import { newLayer, layerRoles, roleName } from './campus-layers';
import type { LayerRole } from './campus-layer-types';
import type { LayerWorkspaceState } from './useLayerWorkspace';
import { LayerSettings } from './LayerSettings';
export function LayerCatalogue({ state }: { state: LayerWorkspaceState }) {
  const {
    explorerTab,
    query,
    setQuery,
    items,
    descendants,
    row,
    createName,
    setCreateName,
    createRole,
    setCreateRole,
    save,
    onView,
    view,
  } = state;

  return (
    <>
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
          <LayerSettings state={state} />
        </>
      )}
    </>
  );
}
