import { GripVertical, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PhotoImage, StableCard, Pages } from './photo-manager-cards';
import type { PhotoManagerState } from './usePhotoManager';

export function PhotoGalleryPanel({ state }: { state: PhotoManagerState }) {
  const {
    tab,
    setOptimizing,
    addFiles,
    queue,
    busy,
    gallery,
    ordering,
    galleryPage,
    previewUrls,
    setPreviewUrls,
    published,
    editPhoto,
    apply,
    setRemoved,
    setGalleryPage,
  } = state;

  return (
    <>
      {tab === 'gallery' && (
        <>
          <button onClick={() => setOptimizing({})}>
            Local image drafts · edit offline
          </button>
          <div
            className="photo-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <label className="photo-add">
              Add photos
              <input
                aria-label="Add photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!queue.editable || busy === 'attach'}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
            </label>
            <p>
              Choose files or drop them here. JPEG, PNG or WebP · up to 25 MiB
              each for local optimisation. Originals remain on this device.
            </p>
          </div>
          {!gallery.length && (
            <p>
              Add a building view or an entrance photograph to help visitors
              recognise this place.
            </p>
          )}
          <p id={ordering.instructionsId} className="small-note">
            Drag the grip to arrange photos. The first photo is the cover. With
            a keyboard, press Space on a grip, use arrow keys or Home/End, then
            Space to drop. Escape cancels.
          </p>
          <output className="sr-only" aria-live="polite">
            {ordering.announcement}
          </output>
          <div className="photo-grid" aria-label="Gallery order">
            {gallery
              .slice(galleryPage * 20, (galleryPage + 1) * 20)
              .map((p, localIndex) => {
                const i = galleryPage * 20 + localIndex;
                return (
                  <StableCard
                    key={p.id}
                    value={p}
                    detail={`${i}:${busy}:${queue.editable}:${ordering.preview?.id}:${ordering.preview?.to}`}
                  >
                    <article
                      className="photo-card"
                      data-photo-id={p.id}
                      data-dragging={ordering.preview?.id === p.id || undefined}
                      data-drop-target={ordering.preview?.to === i || undefined}
                    >
                      <PhotoImage
                        photo={{
                          ...p,
                          url: previewUrls[p.id] || p.url,
                        }}
                        onUrl={(url) =>
                          setPreviewUrls((v) => ({ ...v, [p.id]: url }))
                        }
                      />
                      <h3>{p.caption}</h3>
                      <p>
                        {i === 0 && <strong>Cover · </strong>}
                        {published.has(JSON.stringify(p))
                          ? 'Published'
                          : 'In map draft'}
                        {p.historical ? ' · Historical' : ''}
                      </p>
                      <div className="photo-actions">
                        <button
                          className="photo-icon photo-drag-handle"
                          title="Drag to reorder; Space and arrow keys with a keyboard"
                          {...ordering.handle(p, i)}
                        >
                          <GripVertical aria-hidden="true" />
                        </button>
                        <button
                          className="photo-icon"
                          title="Edit photo"
                          aria-label={`Edit photo: ${p.caption}`}
                          disabled={!queue.editable || !!busy}
                          onClick={() => void editPhoto(p)}
                        >
                          <SlidersHorizontal aria-hidden="true" />
                        </button>
                        <button
                          className="photo-icon photo-delete"
                          title="Delete from gallery"
                          aria-label={`Delete photo: ${p.caption}`}
                          disabled={!queue.editable || !!busy}
                          onClick={() => {
                            if (apply([], [p.id])) setRemoved(true);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  </StableCard>
                );
              })}
          </div>
          <Pages
            page={galleryPage}
            count={gallery.length}
            onPage={setGalleryPage}
            label="Gallery"
          />
        </>
      )}
    </>
  );
}
