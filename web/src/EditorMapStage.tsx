import { Redo2, Undo2 } from 'lucide-react';
import { Suspense } from 'react';
import { MapView } from './MapView';
import { campusLayers, layerKey, layerMembership } from './campus-layers';
import { featureEdit } from './editor-features';
import {
  LayerGeometry,
  LayerWorkspace,
  PrecisionControls,
  SurveyPanel,
} from './editor-workspace-shared';
import { disconnectedSurveyPaths } from './survey-model';
import type { MapEdit } from './types';

import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorMapLifecycleBindings } from './useEditorMapLifecycle';
import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSourcesBindings } from './useEditorSources';
import type { EditorTasksBindings } from './useEditorTasks';

type Props = Pick<
  EditorSessionStateBindings,
  | 'dark'
  | 'store'
  | 'owner'
  | 'prepareOffline'
  | 'workspace'
  | 'survey'
  | 'setSurvey'
  | 'setSurveyRecording'
  | 'tab'
  | 'setTab'
  | 'setExplorer'
  | 'layersOpen'
  | 'setLayersOpen'
  | 'layerView'
  | 'setLayerView'
  | 'overlap'
  | 'setOverlap'
  | 'layerOperation'
  | 'setLayerOperation'
  | 'cutterRequest'
  | 'selected'
  | 'tool'
  | 'buildingMode'
  | 'buildingSelection'
  | 'setBuildingSelection'
  | 'precisionOpen'
  | 'setPrecisionOpen'
  | 'precision'
  | 'setPrecision'
  | 'threeD'
  | 'setThreeD'
  | 'simple3D'
  | 'opacity'
  | 'preview'
  | 'ready'
  | 'routes'
  | 'mapRef'
  | 'controller'
  | 'repairPreview'
  | 'validation'
> &
  Pick<EditorSourcesBindings, 'setAppearancePreview' | 'rendered'> &
  Pick<EditorSelectionBindings, 'selectId' | 'commitLayers' | 'zoomLayers'> &
  Pick<EditorRepairBindings, 'stageRepair'> &
  Pick<EditorDrawingBindings, 'begin'> &
  Pick<EditorMapLifecycleBindings, 'mapReady' | 'undo' | 'cancel'> &
  Pick<EditorTasksBindings, 'toolButtons'>;
export function EditorMapStage(props: Props) {
  const {
    dark,
    store,
    owner,
    prepareOffline,
    workspace,
    survey,
    setSurvey,
    setSurveyRecording,
    tab,
    setTab,
    setExplorer,
    layersOpen,
    setLayersOpen,
    layerView,
    setLayerView,
    overlap,
    setOverlap,
    layerOperation,
    setLayerOperation,
    cutterRequest,
    selected,
    tool,
    buildingMode,
    buildingSelection,
    setBuildingSelection,
    precisionOpen,
    setPrecisionOpen,
    precision,
    setPrecision,
    threeD,
    setThreeD,
    simple3D,
    opacity,
    preview,
    ready,
    routes,
    mapRef,
    controller,
    repairPreview,
    validation,
    setAppearancePreview,
    rendered,
    selectId,
    commitLayers,
    zoomLayers,
    stageRepair,
    begin,
    mapReady,
    undo,
    cancel,
    toolButtons,
  } = props;
  return (
    <>
      <MapView
        data={rendered}
        dark={dark}
        threeD={threeD}
        simple={simple3D}
        editor
        editing={
          !!tool ||
          !!workspace.unfinished ||
          survey ||
          (selected?.kind === 'building' && buildingMode === 'outline')
        }
        buildingOpacity={
          survey ||
          tool === 'entrance' ||
          tool === 'path' ||
          tool === 'barrier' ||
          tool === 'building' ||
          (selected?.kind === 'building' && buildingMode === 'outline')
            ? 0.2
            : opacity
        }
        routes={routes}
        panelBesideMap
        onSelect={() => {}}
        buildingSelection={buildingSelection}
        onBuildingSelect={(feature, hit) => {
          if (workspace.roofDraft) {
            if (
              hit?.buildingId === workspace.roofDraft.buildingId &&
              hit.partId === workspace.roofDraft.partId &&
              hit.role === 'roof'
            )
              setBuildingSelection(hit);
            return;
          }
          if (selected?.id === hit?.buildingId && buildingMode === 'roof') {
            setBuildingSelection(hit);
            return;
          }
          selectId('building', String(feature.properties?.id));
          if (hit) setBuildingSelection(hit);
        }}
        onReady={mapReady}
      />
      {survey && ready > 0 && mapRef.current && (
        <Suspense fallback={<output>Loading survey tools...</output>}>
          <SurveyPanel
            owner={owner}
            map={mapRef.current}
            data={validation.data}
            edits={workspace.edits}
            selected={selected}
            close={() => setSurvey(false)}
            prepareOffline={prepareOffline}
            recordingChanged={setSurveyRecording}
            view2D={() => setThreeD(false)}
            apply={async (edits, previousIds) => {
              const removed = workspace.edits
                .filter(
                  (e) =>
                    previousIds.includes(e.id) &&
                    !edits.some((n) => n.id === e.id),
                )
                .map((e) => ({ ...e, deleted: true }));
              edits = [...edits, ...removed];
              const next = [
                ...workspace.edits.filter(
                  (e) => !edits.some((n) => n.kind === e.kind && n.id === e.id),
                ),
                ...edits,
              ];
              const checked = await validation.check(next);
              const addedErrors = checked.errors.filter(
                (e) => !validation.errors.includes(e),
              );
              if (addedErrors.length) throw new Error(addedErrors.join(' '));
              if (
                disconnectedSurveyPaths(validation.data, checked.data, edits)
                  .length
              )
                throw new Error(
                  'This section has no usable connection to the mapped network. Keep it as a saved survey until connected.',
                );
              workspace.commit(next, null);
              if (navigator.onLine && !(await workspace.flush()))
                throw new Error(
                  'Map changes are saved locally. Resolve the draft save issue before retrying.',
                );
              return edits.map(
                (e) =>
                  featureEdit(checked.data, e.kind, e.id, store.edits) || e,
              );
            }}
          />
        </Suspense>
      )}
      <div
        className="editor-tools editor-card"
        role="toolbar"
        aria-label="Map drawing tools"
      >
        <button
          aria-label="Precision drawing"
          aria-pressed={precisionOpen}
          disabled={preview || !ready}
          onClick={() => {
            setPrecision(controller.current?.getPrecision() || precision);
            setPrecisionOpen((v) => !v);
          }}
        >
          <span>∟</span>
          <span>Precision</span>
        </button>
        {toolButtons.map(({ kind, name, icon: Icon, shortcut }) => (
          <button
            key={name}
            className={tool === kind ? 'active' : ''}
            aria-label={name}
            aria-pressed={tool === kind}
            title={`${name}${shortcut ? ` (${shortcut})` : ''}`}
            disabled={
              preview ||
              !ready ||
              (!!kind && (!!tool || !!workspace.unfinished || !!repairPreview))
            }
            onClick={() => (kind ? begin(kind) : cancel())}
          >
            <Icon size={20} />
            <span>{name}</span>
          </button>
        ))}

        <hr />
        <button
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!workspace.past.length}
          onClick={() => undo()}
        >
          <Undo2 size={19} />
          <span>Undo</span>
        </button>
        <button
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!workspace.future.length}
          onClick={() => undo(true)}
        >
          <Redo2 size={19} />
          <span>Redo</span>
        </button>
      </div>
      {precisionOpen && !preview && (
        <Suspense fallback={null}>
          <PrecisionControls
            settings={precision}
            drawing={!!tool}
            selection={selected?.geometry}
            onSettings={(value) => {
              setPrecision(value);
              controller.current?.setPrecision(value);
            }}
            onSegment={(length, bearing) =>
              controller.current?.addSegment(length, bearing)
            }
            onRectangle={(width, depth, bearing) =>
              controller.current?.rectangle(width, depth, bearing)
            }
            onTrace={(points) => controller.current?.appendReference(points)}
            onClose={() => setPrecisionOpen(false)}
          />
        </Suspense>
      )}
      {overlap && (
        <dialog
          open
          className="editor-overlap editor-card"
          aria-label="Choose overlapping feature"
        >
          <strong>Choose a feature</strong>
          <button
            aria-label="Close feature chooser"
            onClick={() => setOverlap(null)}
          >
            ×
          </button>
          {overlap.features.map((f) => {
            const edit = featureEdit(
              validation.data,
              f.kind,
              f.id,
              workspace.edits,
            );
            const l = campusLayers(validation.data).items.find(
              (l) =>
                l.id ===
                layerMembership(validation.data).get(layerKey(f.kind, f.id)),
            );
            return (
              <button
                key={`${f.kind}:${f.id}`}
                onClick={() => selectId(f.kind, f.id, false, overlap.anchor)}
              >
                <strong>
                  {f.kind === 'path'
                    ? 'Routing path'
                    : f.kind === 'land' && l?.role === 'road-surface'
                      ? 'Road surface'
                      : f.kind}{' '}
                  · {String(edit?.properties.name || 'Unnamed')}
                </strong>
                <small>
                  {l?.name} ·{' '}
                  {String(
                    edit?.properties.surface ||
                      edit?.properties.landClass ||
                      '',
                  )}{' '}
                  · {String(edit?.properties.sourceId || f.id)}
                </small>
              </button>
            );
          })}
        </dialog>
      )}
      {layersOpen && tab === 'map' && !tool && (
        <Suspense fallback={<div className="editor-card">Loading layers…</div>}>
          <LayerWorkspace
            data={validation.data}
            issues={validation.issues}
            edits={workspace.edits}
            view={layerView}
            onView={setLayerView}
            onCommit={commitLayers}
            onAppearancePreview={setAppearancePreview}
            onSelect={(kind, id) => selectId(kind, id, true)}
            onZoom={zoomLayers}
            onImport={() => {
              setLayersOpen(false);
              setTab('campuses');
            }}
            onClose={() => {
              setLayersOpen(false);
              setExplorer(true);
            }}
            onDraw={(layer, type) =>
              begin(layer.role === 'overlay' ? 'overlay' : 'land', {
                mapLayerId: layer.id,
                mapLayerSource: 'owner',
                drawingGeometry: type,
                name: layer.name,
                ...(layer.role === 'road-surface' ? { landClass: 'road' } : {}),
              })
            }
            onGeometry={(operation, keys) =>
              setLayerOperation({ operation, keys })
            }
          />
        </Suspense>
      )}
      {layerOperation && (
        <Suspense
          fallback={<div className="editor-card">Loading geometry tools…</div>}
        >
          <LayerGeometry
            data={validation.data}
            edits={workspace.edits}
            request={layerOperation}
            onClose={() => setLayerOperation(null)}
            onPreview={stageRepair}
            onDrawCutter={(request) => {
              cutterRequest.current = request;
              setLayerOperation(null);
              begin('overlay', {
                name: 'Geometry preview',
                temporaryGeometry: true,
                geometryRequest: request,
                drawingGeometry:
                  request.operation === 'split' ? 'LineString' : 'Polygon',
              });
            }}
            onWindow={(part, ring, start) => {
              const key = layerOperation.keys[0],
                index = key.indexOf(':');
              selectId(
                key.slice(0, index) as MapEdit['kind'],
                key.slice(index + 1),
              );
              controller.current?.selectWindow(part, ring, start);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
