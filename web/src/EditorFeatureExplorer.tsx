import {
  ArrowUpRight,
  Building2,
  DoorOpen,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Route as RouteIcon,
  Search,
} from 'lucide-react';
import { WorkspacePane } from './WorkspaceFrame';

import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorTasksBindings } from './useEditorTasks';

type Props = Pick<
  EditorSessionStateBindings,
  | 'state'
  | 'workspace'
  | 'tab'
  | 'search'
  | 'setSearch'
  | 'filter'
  | 'setFilter'
  | 'explorer'
  | 'setExplorer'
  | 'layersOpen'
  | 'selected'
  | 'tool'
  | 'preview'
  | 'ready'
  | 'showRoutes'
  | 'setShowRoutes'
  | 'repairPreview'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'selectId'> &
  Pick<EditorDrawingBindings, 'begin'> &
  Pick<EditorTasksBindings, 'visibleTasks'>;
export function EditorFeatureExplorer(props: Props) {
  const {
    state,
    workspace,
    tab,
    search,
    setSearch,
    filter,
    setFilter,
    explorer,
    setExplorer,
    layersOpen,
    selected,
    tool,
    preview,
    ready,
    showRoutes,
    setShowRoutes,
    repairPreview,
    validation,
    selectId,
    begin,
    visibleTasks,
  } = props;
  return (
    tab === 'map' &&
    !layersOpen && (
      <WorkspacePane id="left" title="Features" enabled={explorer}>
        <div
          className={`editor-explorer ${explorer && !layersOpen ? '' : 'collapsed'}`}
        >
          {explorer ? (
            <section className="editor-card">
              <div className="editor-explorer-top">
                <span className="editor-eyebrow">
                  {state.campus?.name || 'LASU · OJO CAMPUS'}
                </span>
                <button
                  className="editor-icon"
                  aria-label="Close feature list"
                  onClick={() => setExplorer(false)}
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <label className="editor-search">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search map features"
                  placeholder="Find a place or building"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className="editor-create-model"
                disabled={
                  preview ||
                  !ready ||
                  !!tool ||
                  !!workspace.unfinished ||
                  !!repairPreview
                }
                title="Draw a building footprint, then open Edit model"
                onClick={() => begin('building')}
              >
                <Building2 size={20} />
                <span>Create model</span>
              </button>
              <div className="editor-filters">
                {[
                  ['needs', 'Needs mapping'],
                  ['all', 'All'],
                  ['drafts', 'Drafts'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? 'active' : ''}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="editor-result-count">
                {visibleTasks.length} features <span>Click to locate</span>
              </div>
              <div className="editor-feature-list">
                {visibleTasks.slice(0, 100).map((t, i) => (
                  <button
                    key={`${t.kind}:${t.id}:${i}`}
                    onClick={() => selectId(t.kind, t.id, true)}
                    className={
                      selected?.kind === t.kind && selected.id === t.id
                        ? 'selected'
                        : ''
                    }
                  >
                    <span className={`editor-feature-icon ${t.kind}`}>
                      {t.kind === 'building' ? (
                        <Building2 size={17} />
                      ) : t.kind === 'path' ? (
                        <RouteIcon size={17} />
                      ) : t.kind === 'entrance' ? (
                        <DoorOpen size={17} />
                      ) : (
                        <MapPin size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.reason}</small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!visibleTasks.length && (
                  <p className="editor-empty">
                    {filter === 'drafts' && !search
                      ? 'No unpublished changes. Published work stays on the map.'
                      : 'No matching features.'}
                  </p>
                )}
                {visibleTasks.length > 100 && (
                  <p className="small-note">Search to narrow these results.</p>
                )}
              </div>
              <div className="editor-explorer-bottom">
                <span>
                  <DoorOpen size={15} />
                  {validation.data.entrances?.length || 0} entrances
                </span>
                <button
                  className="editor-text"
                  onClick={() => setShowRoutes(!showRoutes)}
                >
                  <RouteIcon size={15} /> Test route
                </button>
              </div>
            </section>
          ) : (
            <button
              className="editor-card editor-icon"
              aria-label="Open explorer"
              disabled={!!tool}
              onClick={() => setExplorer(true)}
            >
              <PanelLeftOpen size={20} />
            </button>
          )}
        </div>
      </WorkspacePane>
    )
  );
}
