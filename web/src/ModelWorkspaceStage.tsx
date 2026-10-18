import { Columns2, Image, Orbit, ScanFace, Split, Ungroup } from 'lucide-react';
import { Panel } from 'react-resizable-panels';
import { wallLength } from './model-authoring';
import { detailInstanceSelection } from './model-instances';
import { ModelButton } from './ModelButton';
import { ModelPhotoPanel } from './ModelPhotoPanel';
import { PhotoModelPreview } from './PhotoModelPreview';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelSelectionActionsBindings } from './useModelSelectionActions';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'data'
  | 'selection'
  | 'onSelection'
  | 'workspace'
  | 'compact'
  | 'setStructureOpen'
  | 'setPlanHost'
  | 'shell'
  | 'openPanel'
  | 'mode'
  | 'setMode'
  | 'setSelected'
  | 'tab'
  | 'setTab'
  | 'before'
  | 'referenceLayout'
  | 'setMeshSelection'
  | 'setPreviewScene'
  | 'reference'
  | 'setReference'
  | 'setPhotoId'
  | 'surfaceFrame'
  | 'surfacePreview'
  | 'webglUnavailable'
  | 'setWebglUnavailable'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'walls'
    | 'activeWall'
    | 'visual'
    | 'facade'
    | 'sourceElements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'renderedFeature'
    | 'active'
    | 'photos'
    | 'photo'
    | 'label'
    | 'choose'
  > &
  Pick<ModelCommitBindings, 'applyWall'> &
  Pick<ModelEditingControlsBindings, 'switchMode'> &
  Pick<
    ModelSelectionActionsBindings,
    | 'selectionActions'
    | 'showContextActions'
    | 'grouped'
    | 'ungroupSelection'
    | 'detachSelectedInstance'
  >;
export function ModelWorkspaceStage(props: Props) {
  const {
    edit,
    data,
    selection,
    onSelection,
    workspace,
    compact,
    setStructureOpen,
    setPlanHost,
    shell,
    openPanel,
    mode,
    setMode,
    setSelected,
    tab,
    setTab,
    before,
    referenceLayout,
    setMeshSelection,
    setPreviewScene,
    reference,
    setReference,
    setPhotoId,
    surfaceFrame,
    surfacePreview,
    webglUnavailable,
    setWebglUnavailable,
    walls,
    activeWall,
    visual,
    facade,
    sourceElements,
    selected,
    locked,
    hidden,
    renderedFeature,
    active,
    photos,
    photo,
    label,
    choose,
    applyWall,
    switchMode,
    selectionActions,
    showContextActions,
    grouped,
    ungroupSelection,
    detachSelectedInstance,
  } = props;
  return (
    <Panel
      id="model"
      className="model-layout-panel"
      minSize={compact ? 0 : '320px'}
    >
      <main className="model-stage">
        {mode === 'details' && (
          <label className="model-wall-picker">
            Mapped wall
            <select value={activeWall} onChange={(e) => choose(e.target.value)}>
              {walls.map((w) => (
                <option key={w.wallId} value={w.wallId}>
                  {w.label} · {wallLength(w.coordinates).toFixed(2)} m
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset
          className="model-mobile-tabs model-viewport-tabs"
          aria-label="Workspace view"
        >
          <ModelButton
            icon={<Orbit />}
            aria-pressed={tab === '3d'}
            disabled={webglUnavailable}
            title={
              webglUnavailable
                ? '3D unavailable on this device; use Edit surface'
                : 'Orbit the model'
            }
            onClick={() => {
              setTab('3d');
              openPanel('none');
            }}
          >
            Orbit
          </ModelButton>
          <ModelButton
            icon={<ScanFace />}
            aria-pressed={tab === 'surface'}
            disabled={
              before || !['details', 'roof', 'outline', 'mesh'].includes(mode)
            }
            title={
              !['details', 'roof', 'outline', 'mesh'].includes(mode)
                ? 'Select a wall, roof, or footprint to edit its surface'
                : 'Align the model and edit this surface'
            }
            onClick={() => {
              setTab('surface');
              openPanel('none');
            }}
          >
            Edit surface
          </ModelButton>
          <ModelButton
            icon={<Image />}
            aria-pressed={tab === 'photo'}
            onClick={() => {
              if (referenceLayout.active)
                shell.current
                  ?.querySelector<HTMLElement>('.model-photo-view select')
                  ?.focus();
              else setTab('photo');
              openPanel('none');
            }}
          >
            Photo
          </ModelButton>
          <ModelButton
            icon={<Columns2 />}
            aria-pressed={referenceLayout.enabled}
            title={
              referenceLayout.enabled && !referenceLayout.fits
                ? 'Reference split will return when there is room for both panes'
                : 'Show the model beside its reference photograph'
            }
            onClick={() => {
              if (!referenceLayout.enabled && !referenceLayout.fits) {
                setStructureOpen(false);
                openPanel('none');
              }
              if (!referenceLayout.enabled && tab === 'photo') setTab('3d');
              referenceLayout.toggle();
            }}
          >
            Reference split
          </ModelButton>
        </fieldset>
        {selected.length > 0 && (
          <div
            className="model-selected-actions"
            aria-label="Selected item actions"
          >
            {selectionActions}
            <span>
              {selected.length === 1 && active
                ? label(active)
                : `${selected.length} selected`}
            </span>
            {grouped && (
              <ModelButton
                icon={<Ungroup />}
                disabled={before || selected.some((id) => locked.includes(id))}
                onClick={ungroupSelection}
              >
                Ungroup
              </ModelButton>
            )}
            {selected.length === 1 && active && active.count > 1 && (
              <ModelButton
                icon={<Split />}
                disabled={before || locked.includes(active.id)}
                onClick={detachSelectedInstance}
              >
                Detach instance
              </ModelButton>
            )}
          </div>
        )}
        {webglUnavailable && (
          <p className="small-note">
            3D is unavailable. Edit surface uses a 2D drawing; your draft is
            retained.
          </p>
        )}
        <div
          ref={referenceLayout.host}
          data-reference-split={referenceLayout.active}
          style={referenceLayout.style}
          className={`model-view-columns model-tab-${tab === 'surface' && webglUnavailable ? 'wall' : tab}`}
        >
          <div
            ref={setPlanHost}
            className="model-plan-host"
            hidden={
              !(tab === 'surface') ||
              !['details', 'roof', 'outline'].includes(mode)
            }
          />
          <div className="model-3d-view">
            <PhotoModelPreview
              onScene={setPreviewScene}
              meshEditing={mode === 'mesh'}
              onActions={showContextActions}
              active={!webglUnavailable && (tab === '3d' || tab === 'surface')}
              surfaceEditing={
                tab === 'surface' && mode !== 'mesh' && !webglUnavailable
              }
              surface={surfaceFrame}
              onUnavailable={() => {
                setWebglUnavailable(true);
                setTab('surface');
              }}
              hidden={hidden}
              feature={renderedFeature}
              visual={visual}
              data={data}
              wallId={activeWall}
              selection={
                mode !== 'details' && mode !== 'review'
                  ? selection || { buildingId: edit.id }
                  : {
                      buildingId: edit.id,
                      wallId: activeWall,
                      ...(surfacePreview && 'elements' in surfacePreview
                        ? {
                            elementId:
                              selected.length === 1 ? selected[0] : undefined,
                          }
                        : detailInstanceSelection(
                            sourceElements,
                            selected.length === 1 ? selected[0] : undefined,
                          )),
                    }
              }
              onSelect={(s) => {
                if (s.objectId) {
                  setMeshSelection({
                    objectId: s.objectId,
                    kind: 'object',
                    ids: [],
                  });
                  switchMode('mesh');
                } else if (s.wallId) {
                  setMode('details');
                  choose(s.wallId, s.elementId, s.instanceIndex);
                } else if (s.partId) {
                  setSelected([]);
                  onSelection(s);
                  switchMode(s.role === 'roof' ? 'roof' : 'appearance');
                }
              }}
            />
          </div>
          {referenceLayout.divider}
          <div className="model-photo-view">
            <ModelButton
              variant="outline"
              aria-expanded={reference}
              onClick={() => setReference((v) => !v)}
            >
              {reference ? 'Hide' : 'Show'} photograph reference
            </ModelButton>
            {(reference ||
              compact ||
              tab === 'photo' ||
              referenceLayout.active) && (
              <ModelPhotoPanel
                key={edit.id}
                photos={photos}
                photo={photo}
                onPhoto={setPhotoId}
                facade={facade}
                workspace={workspace}
                buildingId={edit.id}
                onCommit={(next) => applyWall(next)}
              />
            )}
          </div>
        </div>
      </main>
    </Panel>
  );
}
