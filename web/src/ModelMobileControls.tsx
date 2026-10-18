import { RotateCcw as ActionRotateCcw } from 'lucide-react';
import { ModelButton } from './ModelButton';

import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'compact'
  | 'landscape'
  | 'detent'
  | 'setDetent'
  | 'touchTool'
  | 'setTouchTool'
  | 'sheetStart'
  | 'sheetDragged'
  | 'openPanel'
  | 'mode'
  | 'tab'
  | 'setTab'
  | 'before'
  | 'setBefore'
  | 'error'
  | 'paste'
  | 'setPaste'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'metrics'
    | 'selected'
    | 'locked'
    | 'active'
    | 'unsaved'
    | 'discardInput'
    | 'label'
  > &
  Pick<ModelEditingControlsBindings, 'switchMode' | 'mobilePanel'>;
export function ModelMobileControls(props: Props) {
  const {
    compact,
    landscape,
    detent,
    setDetent,
    touchTool,
    setTouchTool,
    sheetStart,
    sheetDragged,
    openPanel,
    mode,
    tab,
    setTab,
    before,
    setBefore,
    error,
    paste,
    setPaste,
    metrics,
    selected,
    locked,
    active,
    unsaved,
    discardInput,
    label,
    switchMode,
    mobilePanel,
  } = props;
  return (
    compact && (
      <>
        {mobilePanel !== 'none' && (
          <div className="model-sheet-heading">
            {landscape && (
              <nav className="model-panel-tabs" aria-label="Editing panel">
                <ModelButton
                  variant="outline"
                  aria-pressed={mobilePanel === 'walls'}
                  onClick={() => openPanel('walls')}
                >
                  Structure
                </ModelButton>
                <ModelButton
                  variant="outline"
                  aria-pressed={mobilePanel !== 'walls'}
                  onClick={() =>
                    openPanel(mode === 'details' ? 'edit' : 'mode')
                  }
                >
                  Properties
                </ModelButton>
              </nav>
            )}
            <ModelButton
              variant="outline"
              className="model-sheet-handle"
              aria-label={detent === 'half' ? 'Expand tools' : 'Collapse tools'}
              onPointerDown={(e) => {
                sheetDragged.current = false;
                sheetStart.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                const dy = e.clientY - sheetStart.current;
                if (Math.abs(dy) > 25) {
                  sheetDragged.current = true;
                  if (dy > 90 && detent === 'half') openPanel('none');
                  else setDetent(dy < 0 ? 'full' : 'half');
                }
              }}
              onClick={() => {
                if (!sheetDragged.current)
                  setDetent((d) => (d === 'half' ? 'full' : 'half'));
              }}
            >
              ↕{' '}
              {mobilePanel === 'mode'
                ? mode
                : mobilePanel === 'walls'
                  ? 'Walls & details'
                  : mobilePanel === 'edit'
                    ? 'Detail properties'
                    : mobilePanel === 'more'
                      ? 'More tools'
                      : mobilePanel === 'photo'
                        ? 'Photo alignment'
                        : mobilePanel === 'copy'
                          ? 'Copy placement'
                          : 'Add detail'}
            </ModelButton>
            <ModelButton
              variant="outline"
              className="model-sheet-done"
              onClick={() => {
                (document.activeElement as HTMLElement)?.blur();
                if (paste) setPaste(null);
                else {
                  const multi = touchTool === 'multi';
                  openPanel('none');
                  if (multi) setTouchTool('multi');
                }
              }}
            >
              Done
            </ModelButton>
          </div>
        )}
        {error && (
          <div role="alert" className="model-mobile-alert">
            <ModelButton
              variant="outline"
              className="model-mobile-error"
              onClick={() => switchMode('review')}
            >
              {error}
            </ModelButton>
          </div>
        )}
        <div className="model-selection-strip" aria-live="polite">
          {mode === 'details' && selected.length
            ? `${selected.length} selected${active && selected.length === 1 ? ' · ' + label(active) : ''}`
            : metrics
              ? `${metrics.length.toFixed(1)} m · ${metrics.direction} wall`
              : 'Choose a wall'}{' '}
          ·{' '}
          {touchTool === 'multi'
            ? 'Multi-select'
            : touchTool === 'select'
              ? tab === '3d'
                ? 'Tap to select · hold a detail for actions'
                : 'Tap to select'
              : touchTool === 'move'
                ? 'Move enabled'
                : 'Resize enabled'}
          {before ? ' · Before (read only)' : ''}
        </div>
        <nav className="model-bottom-actions" aria-label="Mobile model actions">
          {mode === 'details' ? (
            selected.length ? (
              <>
                <ModelButton
                  variant="outline"
                  disabled={
                    before || selected.every((id) => locked.includes(id))
                  }
                  aria-pressed={touchTool === 'move'}
                  onClick={() => {
                    openPanel('none');
                    setTouchTool(touchTool === 'move' ? 'select' : 'move');
                    setTab((view) => (view === 'surface' ? view : 'surface'));
                  }}
                >
                  Move
                </ModelButton>
                <ModelButton
                  variant="outline"
                  disabled={
                    before ||
                    selected.length !== 1 ||
                    selected.every((id) => locked.includes(id)) ||
                    active?.count !== 1
                  }
                  aria-pressed={touchTool === 'resize'}
                  onClick={() => {
                    openPanel('none');
                    setTouchTool(touchTool === 'resize' ? 'select' : 'resize');
                    setTab((view) => (view === 'surface' ? view : 'surface'));
                  }}
                >
                  Resize
                </ModelButton>
                <ModelButton
                  variant="outline"
                  onClick={() => openPanel('edit')}
                >
                  Edit
                </ModelButton>
              </>
            ) : (
              <>
                <ModelButton
                  variant="outline"
                  disabled={before}
                  onClick={() => openPanel('add')}
                >
                  Add
                </ModelButton>
                <ModelButton
                  variant="outline"
                  onClick={() => openPanel('walls')}
                >
                  Walls
                </ModelButton>
                <ModelButton
                  variant="outline"
                  aria-pressed={touchTool === 'multi'}
                  onClick={() => {
                    openPanel('walls');
                    setTouchTool('multi');
                  }}
                >
                  Multi-select
                </ModelButton>
              </>
            )
          ) : (
            <>
              <ModelButton variant="outline" onClick={() => openPanel('mode')}>
                {mode === 'review' ? 'Review issues' : 'Edit ' + mode}
              </ModelButton>
              <ModelButton
                variant="outline"
                onClick={() => {
                  openPanel('none');
                  setTouchTool(touchTool === 'move' ? 'select' : 'move');
                  setTab((view) => (view === 'surface' ? view : 'surface'));
                }}
                disabled={!['roof', 'outline'].includes(mode)}
                aria-pressed={touchTool === 'move'}
              >
                Move point
              </ModelButton>
              <ModelButton variant="outline" onClick={() => openPanel('walls')}>
                Walls
              </ModelButton>
            </>
          )}
          <ModelButton
            variant="outline"
            onClick={() => openPanel(tab === 'photo' ? 'photo' : 'more')}
          >
            More
          </ModelButton>
        </nav>
        {mobilePanel === 'more' && mode !== 'details' && (
          <section data-mobile-panel="more">
            <ModelButton
              variant="outline"
              onClick={() => {
                setBefore((v) => !v);
                openPanel('none');
              }}
            >
              Before / after
            </ModelButton>
            <ModelButton
              variant="outline"
              onClick={() => switchMode('details')}
            >
              Edit architectural details
            </ModelButton>
            <ModelButton variant="outline" onClick={() => switchMode('review')}>
              Review changes
            </ModelButton>
            {unsaved && (
              <ModelButton
                variant="outline"
                icon={<ActionRotateCcw />}
                onClick={discardInput}
              >
                Discard unfinished input
              </ModelButton>
            )}
          </section>
        )}
      </>
    )
  );
}
