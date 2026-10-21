import { WorkspaceFrame } from './WorkspaceFrame';
import { Upload, X, SlidersHorizontal, FolderOpen, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import PhotoCompare from './PhotoCompare';
import {
  usePhotoOptimizer,
  type PhotoOptimizerProps,
} from './usePhotoOptimizer';
import { PhotoLocalDrafts } from './PhotoLocalDrafts';
import { PhotoOptimizerDetails } from './PhotoOptimizerDetails';
import { PhotoOptimizerSettings } from './PhotoOptimizerSettings';
import { PhotoOptimizerResult } from './PhotoOptimizerResult';
import './photo-optimizer.css';
export default function PhotoOptimizer(props: PhotoOptimizerProps) {
  const state = usePhotoOptimizer(props);
  const {
    close,
    widePhoto,
    photoLayout,
    current,
    sourceUrl,
    outputUrl,
    tool,
    setTool,
    change,
    panel,
    setPanel,
    details,
    busy,
    render,
    error,
    notice,
    previewBusy,
    activeStage,
    pause,
    setPaused,
    paused,
    controller,
    setNotice,
  } = state;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void close();
      }}
    >
      <DialogContent
        positioning="viewport"
        showCloseButton={false}
        className="photo-optimizer"
        overlayClassName="photo-optimizer-overlay"
        data-wide={widePhoto}
      >
        <DialogTitle className="sr-only">
          Edit &amp; optimise photos
        </DialogTitle>
        <DialogDescription className="sr-only">
          Compare the original with your edited image. Compression stays on this
          device. Upload and publication are separate.
        </DialogDescription>
        <WorkspaceFrame layout={photoLayout} workspace="photo">
          {current && (
            <PhotoCompare
              source={sourceUrl}
              output={outputUrl}
              tool={tool}
              onCancel={() => setTool('navigate')}
              onRegion={(rect) => {
                if (tool === 'crop') change({ crop: rect, masks: [] });
                else if (tool !== 'navigate')
                  change({
                    masks: [...current.recipe.masks, { ...rect, mode: tool }],
                  });
                setTool('navigate');
              }}
            />
          )}
          <header className="photo-editor-header">
            <button
              className="photo-editor-back"
              aria-label="Close image editor"
              title="Close image editor"
              onClick={() => void close()}
            >
              <X />
            </button>
            <span className="photo-editor-filename">
              {current?.filename || 'Photo editor'}
            </span>
            <div className="photo-editor-actions">
              <button
                aria-label="Local image drafts"
                title="Local images & offline tools"
                aria-pressed={panel === 'files'}
                onClick={() =>
                  setPanel((p) => (p === 'files' ? null : 'files'))
                }
              >
                <FolderOpen />
              </button>
              {details && (
                <button
                  aria-label="Photo details"
                  title="Caption, building & credits"
                  aria-pressed={panel === 'details'}
                  onClick={() =>
                    setPanel((p) => (p === 'details' ? null : 'details'))
                  }
                >
                  <Info />
                </button>
              )}
              <button
                aria-label="Image settings"
                title="Image settings"
                aria-pressed={panel === 'edit'}
                onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
              >
                <SlidersHorizontal />
              </button>
              <Button
                aria-label="Use for map"
                title="Prepare the edited photo for the map"
                disabled={busy || !current}
                onClick={() => current && void render([current], true)}
              >
                <Upload />
                <span>Use for map</span>
              </Button>
            </div>
          </header>
          {(error || notice || busy || previewBusy || tool !== 'navigate') && (
            <div className="photo-editor-status" aria-live="polite">
              {error ? (
                <span role="alert">{error}</span>
              ) : busy || previewBusy ? (
                <span>{activeStage || 'Compressing preview…'}</span>
              ) : (
                <span>
                  {tool !== 'navigate'
                    ? 'Drag a rectangle on the image. Escape cancels.'
                    : notice}
                </span>
              )}
              {busy && (
                <>
                  <button
                    onClick={() => {
                      pause.current = !pause.current;
                      setPaused(pause.current);
                    }}
                  >
                    {paused ? 'Resume batch' : 'Pause after this image'}
                  </button>
                  <button onClick={() => controller.current?.abort()}>
                    Cancel processing
                  </button>
                </>
              )}
              {notice && !busy && !previewBusy && (
                <button
                  aria-label="Dismiss image notice"
                  onClick={() => setNotice('')}
                >
                  <X />
                </button>
              )}
            </div>
          )}
          <aside className="photo-source-panel">
            <h3>Original</h3>
            <div className="photo-source-name">
              {current?.filename || 'Choose an image'}
            </div>
          </aside>
          <PhotoLocalDrafts state={state} />
          <PhotoOptimizerDetails state={state} />
          <PhotoOptimizerSettings state={state} />
          <PhotoOptimizerResult state={state} />
        </WorkspaceFrame>
      </DialogContent>
    </Dialog>
  );
}

export type { PhotoOptimizerRequest } from './photo-optimizer-types';
