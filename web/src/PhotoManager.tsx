import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PhotoGallery } from './ArrivalGuide';
import { PhotoImage } from './photo-manager-cards';
import { usePhotoManager, type PhotoManagerProps } from './usePhotoManager';
import { PhotoOptimizerDialog } from './PhotoOptimizerDialog';
import { PhotoGalleryPanel } from './PhotoGalleryPanel';
import { PhotoPrivateLibrary } from './PhotoPrivateLibrary';
import { PhotoUploadQueue } from './PhotoUploadQueue';
import './photo-manager.css';
export function PhotoManager(props: PhotoManagerProps) {
  const state = usePhotoManager(props);
  const {
    gallery,
    open,
    setOpen,
    buildingId,
    panel,
    targetName,
    saveStatus,
    tab,
    setTab,
    queue,
    loadLibrary,
    message,
    removed,
    reordered,
    onUndo,
    setRemoved,
    setReordered,
    setMessage,
    error,
    previewUrls,
    busy,
    attach,
    edit,
  } = state;
  if (!['building', 'entrance', 'place'].includes(edit.kind)) return null;
  return (
    <section className="photo-launcher" aria-label="Building photos">
      <PhotoOptimizerDialog state={state} />
      <div className="photo-strip">
        {gallery.slice(0, 4).map((p) => (
          <PhotoImage key={p.id} photo={p} />
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger disabled={!buildingId} className="editor-secondary">
          Manage photos · {gallery.length}
        </DialogTrigger>
        {!buildingId && (
          <p className="small-note">
            Link this place or entrance to a building before adding photos.
          </p>
        )}
        <DialogContent
          className="photo-workspace"
          overlayClassName="photo-workspace-overlay"
          ref={panel}
        >
          <header>
            <DialogTitle>Photos · {targetName}</DialogTitle>
            <DialogDescription>
              {gallery.length} in this gallery ·{' '}
              {saveStatus === 'Saved' ? 'Map draft saved' : saveStatus}.
              Publication happens through Releases.
            </DialogDescription>
          </header>
          <nav aria-label="Photo workspace">
            <button
              aria-pressed={tab === 'gallery'}
              onClick={() => setTab('gallery')}
            >
              Gallery
            </button>
            <button
              aria-pressed={tab === 'review'}
              onClick={() => setTab('review')}
            >
              Review uploads ({queue.jobs.length})
            </button>
            <button
              aria-pressed={tab === 'private'}
              disabled={!queue.editable}
              onClick={() => void loadLibrary()}
            >
              Private uploads
            </button>
            <button
              aria-pressed={tab === 'preview'}
              onClick={() => setTab('preview')}
            >
              Preview public gallery
            </button>
          </nav>
          <div className="photo-workspace-body">
            <fieldset className="photo-body-controls">
              {!queue.editable && (
                <output>
                  {queue.jobs.length
                    ? 'Photo editing is active in another tab.'
                    : 'Preparing private photo workspace…'}
                </output>
              )}
              {message && (
                <output className="photo-notice">
                  {message}{' '}
                  {(removed || reordered) && (
                    <button
                      data-photo-undo
                      onClick={() => {
                        onUndo();
                        setRemoved(false);
                        setReordered(false);
                        setMessage('Photo change undone.');
                      }}
                    >
                      {removed ? 'Undo removal' : 'Undo reorder'}
                    </button>
                  )}
                </output>
              )}
              {(error || queue.storageError) && (
                <p role="alert" className="photo-error">
                  {error || queue.storageError}
                </p>
              )}
              {tab === 'preview' && (
                <>
                  <p className="small-note">
                    Draft preview — this does not publish changes.
                  </p>
                  {gallery.length ? (
                    <PhotoGallery
                      photos={gallery.map((p) => ({
                        ...p,
                        url: previewUrls[p.id] || p.url,
                      }))}
                    />
                  ) : (
                    <p>No photographs in this gallery yet.</p>
                  )}
                </>
              )}
              <PhotoGalleryPanel state={state} />
              <PhotoPrivateLibrary state={state} />
              <PhotoUploadQueue state={state} />
            </fieldset>
          </div>
          <footer>
            <output>
              {busy
                ? 'Working…'
                : `${queue.jobs.filter((j) => j.state === 'ready').length} photos ready`}
            </output>
            <button
              className="photo-primary"
              disabled={
                !queue.editable ||
                busy === 'attach' ||
                !queue.jobs.some((j) => j.state === 'ready')
              }
              onClick={() => void attach()}
            >
              Add reviewed photos to draft
            </button>
          </footer>
        </DialogContent>
      </Dialog>
    </section>
  );
}
