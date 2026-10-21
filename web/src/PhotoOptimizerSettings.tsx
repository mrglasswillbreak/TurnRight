import { WorkspacePane } from './WorkspaceFrame';
import { ImageDown, Undo2, Redo2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { defaultPhotoRecipe } from './photo-edit';
import type { PhotoOptimizerState } from './usePhotoOptimizer';
import { PhotoEditControls } from './PhotoEditControls';
import { PhotoCompressionControls } from './PhotoCompressionControls';
export function PhotoOptimizerSettings({
  state,
}: {
  state: PhotoOptimizerState;
}) {
  const {
    current,
    panel,
    widePhoto,
    setPanel,
    settingsTab,
    setSettingsTab,
    busy,
    past,
    history,
    future,
    change,
    render,
  } = state;

  return (
    <>
      {current && panel !== 'details' && (
        <WorkspacePane id="right" title="Image settings" enabled={widePhoto}>
          <section
            className="photo-floating-panel photo-edit-panel"
            data-expanded={widePhoto || panel === 'edit'}
            aria-label="Image settings"
          >
            <h3>
              <button
                className="photo-panel-toggle"
                aria-expanded={panel === 'edit'}
                onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
              >
                Edit &amp; compress{' '}
                {panel === 'edit' ? <ChevronDown /> : <ChevronUp />}
              </button>
            </h3>
            {(widePhoto || panel === 'edit') && (
              <div className="photo-panel-scroll photo-opt-controls">
                <nav className="photo-inspector-tabs" aria-label="Photo tools">
                  <button
                    aria-pressed={settingsTab === 'edit'}
                    onClick={() => setSettingsTab('edit')}
                  >
                    Edit
                  </button>
                  <button
                    aria-pressed={settingsTab === 'compress'}
                    onClick={() => setSettingsTab('compress')}
                  >
                    Compress
                  </button>
                  <button onClick={() => setPanel('details')}>Details</button>
                </nav>
                <fieldset disabled={busy}>
                  <div className="photo-edit-history">
                    <Button
                      variant="ghost"
                      disabled={!past.length}
                      onClick={() => history(true)}
                    >
                      <Undo2 />
                      Undo
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!future.length}
                      onClick={() => history(false)}
                    >
                      <Redo2 />
                      Redo
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => change(defaultPhotoRecipe())}
                    >
                      Reset
                    </Button>
                  </div>
                  <PhotoEditControls state={state} />
                  <PhotoCompressionControls state={state} />
                  <p className="photo-map-note">
                    Map uploads use WebP, up to 1600px and 250 KiB. Originals
                    stay on this device.
                  </p>
                </fieldset>
                <Button
                  className="photo-preview-action"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void render([current], false)}
                >
                  <ImageDown />
                  Preview changes
                </Button>
              </div>
            )}
          </section>
        </WorkspacePane>
      )}
    </>
  );
}
