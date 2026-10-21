import { WorkspacePane } from './WorkspaceFrame';
import {
  useLayerWorkspace,
  type LayerWorkspaceProps,
} from './useLayerWorkspace';
import { LayerCatalogue } from './LayerCatalogue';
import { LayerFeatureTable } from './LayerFeatureTable';
import './layer-workspace.css';
export default function LayerWorkspace(props: LayerWorkspaceProps) {
  const state = useLayerWorkspace(props);
  const {
    onClose,
    explorerTab,
    setExplorerTab,
    rows,
    onImport,
    onView,
    view,
    message,
  } = state;

  return (
    <WorkspacePane id="left" title="Layers">
      <section
        className="layer-workspace editor-card"
        aria-label="Campus layers"
      >
        <header>
          <h2>Layers</h2>
          <button onClick={onClose} aria-label="Close layers">
            ×
          </button>
        </header>
        <div
          className="layer-explorer-tabs"
          role="tablist"
          tabIndex={-1}
          aria-label="Layer explorer"
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
              return;
            e.preventDefault();
            const next =
              e.key === 'Home'
                ? 'layers'
                : e.key === 'End'
                  ? 'features'
                  : explorerTab === 'layers'
                    ? 'features'
                    : 'layers';
            setExplorerTab(next);
            e.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next === 'layers' ? 0 : 1]?.focus();
          }}
        >
          <button
            role="tab"
            aria-selected={explorerTab === 'layers'}
            tabIndex={explorerTab === 'layers' ? 0 : -1}
            onClick={() => setExplorerTab('layers')}
          >
            Layers
          </button>
          <button
            role="tab"
            aria-selected={explorerTab === 'features'}
            tabIndex={explorerTab === 'features' ? 0 : -1}
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
        <LayerCatalogue state={state} />
        <LayerFeatureTable state={state} />
        {message && explorerTab !== 'features' && <output>{message}</output>}
      </section>
    </WorkspacePane>
  );
}
