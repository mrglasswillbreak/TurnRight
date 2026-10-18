import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RotateCcw as ActionRotateCcw,
  X as ActionX,
  ArrowLeft,
} from 'lucide-react';
import { ModelButton } from './ModelButton';

import { ModelMobileControls } from './ModelMobileControls';
import { ModelPastePreview } from './ModelPastePreview';
import { ModelWorkspaceLayout } from './ModelWorkspaceLayout';
import { ModelWorkspaceToolbar } from './ModelWorkspaceToolbar';
import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
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
  | 'onClose'
  | 'opener'
  | 'workspace'
  | 'onHistory'
  | 'compact'
  | 'modelLayout'
  | 'modelDefaultLayout'
  | 'modelPanels'
  | 'modelPanelsElement'
  | 'modelPanelsInitialized'
  | 'propertiesOpen'
  | 'setPropertiesOpen'
  | 'landscape'
  | 'setStructureOpen'
  | 'structureOpen'
  | 'reviewOpen'
  | 'setReviewOpen'
  | 'setContextPoint'
  | 'panel'
  | 'detent'
  | 'setDetent'
  | 'touchTool'
  | 'setTouchTool'
  | 'setPlanHost'
  | 'shell'
  | 'sheetStart'
  | 'sheetDragged'
  | 'openPanel'
  | 'initial'
  | 'returnFocus'
  | 'wallViews'
  | 'mode'
  | 'setMode'
  | 'setSelected'
  | 'instance'
  | 'setInstance'
  | 'tab'
  | 'setTab'
  | 'before'
  | 'setBefore'
  | 'error'
  | 'setError'
  | 'grid'
  | 'setGrid'
  | 'referenceLayout'
  | 'setMeshPreview'
  | 'meshSelection'
  | 'setMeshSelection'
  | 'previewScene'
  | 'setPreviewScene'
  | 'setWholeRows'
  | 'reviewResult'
  | 'setReviewResult'
  | 'clipboard'
  | 'setClipboard'
  | 'paste'
  | 'setPaste'
  | 'pending'
  | 'setPending'
  | 'name'
  | 'setName'
  | 'pattern'
  | 'setPattern'
  | 'patternId'
  | 'setPatternId'
  | 'targetBuilding'
  | 'setTargetBuilding'
  | 'targetWall'
  | 'setTargetWall'
  | 'roofDraft'
  | 'setRoofDraft'
  | 'reference'
  | 'setReference'
  | 'setPhotoId'
  | 'surfaceFrame'
  | 'surfacePreview'
  | 'webglUnavailable'
  | 'setWebglUnavailable'
  | 'conversion'
  | 'setConversion'
  | 'pasteTransform'
  | 'setPasteTransform'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'original'
    | 'walls'
    | 'activeWall'
    | 'visual'
    | 'metrics'
    | 'authoring'
    | 'recorded'
    | 'generatedFacades'
    | 'facade'
    | 'sourceElements'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'renderedFeature'
    | 'active'
    | 'photos'
    | 'photo'
    | 'buildings'
    | 'targetEdit'
    | 'targetWalls'
    | 'state'
    | 'unsaved'
    | 'reviewReady'
    | 'discardInput'
    | 'publishErrors'
    | 'label'
    | 'choose'
  > &
  Pick<
    ModelCommitBindings,
    'commit' | 'applyWall' | 'updateElements' | 'patch' | 'tryAction'
  > &
  Pick<
    ModelDetailCommandsBindings,
    | 'stamp'
    | 'duplicate'
    | 'remove'
    | 'add'
    | 'editPattern'
    | 'confirmPaste'
    | 'copiedPlacement'
  > &
  Pick<
    ModelEditingControlsBindings,
    | 'field'
    | 'onRoofDraft'
    | 'onRoofApply'
    | 'switchMode'
    | 'selectTreeTarget'
    | 'mobilePanel'
  > &
  Pick<
    ModelSelectionActionsBindings,
    | 'selectionActions'
    | 'showContextActions'
    | 'dismissActions'
    | 'grouped'
    | 'ungroupSelection'
    | 'detachSelectedInstance'
    | 'actions'
  >;
export function ModelWorkspaceDialog(props: Props) {
  const {
    edit,
    onClose,
    opener,
    workspace,
    onHistory,
    compact,
    landscape,
    structureOpen,
    detent,
    setDetent,
    shell,
    openPanel,
    returnFocus,
    mode,
    setSelected,
    before,
    error,
    setError,
    clipboard,
    setClipboard,
    paste,
    setPaste,
    setPending,
    setTargetWall,
    setRoofDraft,
    activeWall,
    elements,
    selected,
    state,
    unsaved,
    stamp,
    duplicate,
    remove,
    mobilePanel,
    showContextActions,
    dismissActions,
    actions,
  } = props;
  return (
    <DialogContent
      ref={shell}
      finalFocus={opener || returnFocus}
      positioning="viewport"
      className={`photo-model-workspace model-workspace ${compact ? 'model-compact' : 'model-desktop'} ${landscape ? 'model-landscape' : ''} ${before ? 'model-before' : ''}`}
      data-panel={mobilePanel}
      data-detent={detent}
      data-structure={structureOpen ? 'open' : 'closed'}
      data-mode={mode}
      showCloseButton={false}
      overlayClassName="photo-model-overlay"
      onContextMenu={(e) => {
        if (mode !== 'details' || !(e.target instanceof Element)) return;
        const detail = e.target.closest('[data-element-id], [data-detail-id]');
        if (!detail && !e.target.closest('.model-wall-canvas')) return;
        e.preventDefault();
        e.stopPropagation();
        const id =
          detail?.getAttribute('data-element-id') ||
          detail?.getAttribute('data-detail-id');
        if (id && !selected.includes(id)) setSelected([id]);
        showContextActions(e.clientX, e.clientY);
      }}
      onFocusCapture={(e) => {
        if (
          compact &&
          (e.target as HTMLElement).matches('input, textarea, select')
        ) {
          setDetent('full');
          requestAnimationFrame(() =>
            (e.target as HTMLElement).scrollIntoView({
              block: 'nearest',
            }),
          );
        }
      }}
      onKeyDownCapture={dismissActions}
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        const input = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement).tagName,
        );
        if (
          !input &&
          mode === 'details' &&
          selected.length &&
          e.key === 'Delete'
        ) {
          e.preventDefault();
          if (!before) remove();
          return;
        }
        if (
          !input &&
          mode === 'details' &&
          selected.length &&
          e.key === 'Enter' &&
          (e.target as Element).matches('.model-wall-canvas')
        ) {
          e.preventDefault();
          actions[0].run();
          return;
        }
        if (
          !input &&
          mode === 'details' &&
          ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')
        ) {
          e.preventDefault();
          const b = (e.target as Element).getBoundingClientRect();
          showContextActions(
            b.left + Math.min(40, b.width / 2),
            b.top + Math.min(40, b.height / 2),
          );
          return;
        }
        if (
          !input &&
          mode === 'details' &&
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === 'a'
        ) {
          e.preventDefault();
          setSelected(elements.map((v) => v.id));
          return;
        }
        if (
          !input &&
          mode === 'details' &&
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === 'd'
        ) {
          e.preventDefault();
          if (!before) duplicate();
          return;
        }
        if (
          compact &&
          e.key === 'Escape' &&
          mobilePanel !== 'none' &&
          !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (paste) setPaste(null);
          else openPanel('none');
          return;
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(
            (e.target as HTMLElement).tagName,
          )
        ) {
          if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            setRoofDraft(null);
            onHistory?.(e.shiftKey);
          }
          if (e.key.toLowerCase() === 'c' && selected.length) {
            e.preventDefault();
            setClipboard(stamp());
          }
          if (e.key.toLowerCase() === 'v' && clipboard && !before) {
            e.preventDefault();
            setPaste(clipboard);
            setTargetWall(activeWall);
          }
        }
      }}
    >
      <header>
        {!compact && (
          <ModelButton
            className="model-back"
            icon={<ArrowLeft />}
            onClick={onClose}
          >
            Back to map
          </ModelButton>
        )}
        <div>
          <DialogTitle>
            {compact ? '' : 'Model editor · '}
            {String(edit.properties.name || 'Building')}
          </DialogTitle>
          <DialogDescription>
            Precise building tools · dimensions are estimates unless documented.
            Model doors do not create mapped entrances.
          </DialogDescription>
        </div>
        <output aria-live="polite">
          {unsaved ? 'Unsaved input · ' : ''}
          {state}
          {workspace?.error ? ` · ${workspace.error}` : ''}
        </output>
      </header>
      <ModelWorkspaceToolbar {...props} />
      <ModelWorkspaceLayout {...props} />
      <ModelMobileControls {...props} />
      <ModelPastePreview {...props} />
      <footer>
        {error && <p role="alert">{error}</p>}
        <span>
          Draft changes save automatically. Publication requires release review.
        </span>
        {unsaved && (
          <ModelButton
            variant="outline"
            icon={<ActionRotateCcw />}
            onClick={() => {
              setPending(null);
              setRoofDraft(null);
              workspace?.draftRoof(null);
              for (const key of Object.keys(
                workspace?.modelInputs[edit.id] || {},
              ))
                workspace?.recoverModelInput(edit.id, key);
              setError(
                'Unfinished input discarded; saved draft changes remain.',
              );
            }}
          >
            Discard unfinished input
          </ModelButton>
        )}
        <ModelButton variant="outline" icon={<ActionX />} onClick={onClose}>
          Close workspace
        </ModelButton>
      </footer>
    </DialogContent>
  );
}
