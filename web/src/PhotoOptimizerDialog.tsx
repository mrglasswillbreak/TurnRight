import { Suspense } from 'react';
import { photoDetails } from './photo-details';
import { PhotoOptimizer } from './photo-optimizer-loader';
import type { PhotoManagerState } from './usePhotoManager';

export function PhotoOptimizerDialog({ state }: { state: PhotoManagerState }) {
  const {
    optimizing,
    owner,
    target,
    job,
    error,
    reviewForm,
    busy,
    editable,
    attach,
    store,
    setOptimizing,
    setTab,
    setMessage,
    openPhotoEditor,
  } = state;

  return (
    <>
      {optimizing && (
        <Suspense fallback={<output>Loading image tools…</output>}>
          <PhotoOptimizer
            owner={owner}
            target={target}
            request={optimizing}
            details={
              optimizing.replacesJob && job?.key === optimizing.replacesJob ? (
                <>
                  <p>
                    Save caption and credits here. Use for map applies image
                    edits and returns them for a final quality check.
                  </p>
                  {error && (
                    <p role="alert" className="photo-error">
                      {error}
                    </p>
                  )}
                  {reviewForm}
                  <button
                    className="photo-primary"
                    disabled={
                      busy === 'attach' || job.state !== 'ready' || !editable
                    }
                    onClick={() => void attach(job.key)}
                  >
                    Save reviewed details to draft
                  </button>
                </>
              ) : undefined
            }
            protectedIds={store.jobs.flatMap((j) =>
              j.localImageId ? [j.localImageId] : [],
            )}
            onClose={() => setOptimizing(null)}
            onReady={(photos, replacesJob) => {
              const previous = replacesJob
                ? store.snapshot(target).find((j) => j.key === replacesJob)
                : undefined;
              if (
                previous &&
                ['queued', 'uploading', 'processing'].includes(previous.state)
              )
                throw Error(
                  'Wait for the current private upload to finish before replacing it. Your image edits are saved locally.',
                );
              const keys = store.enqueuePrepared(
                target,
                photos.map((p) => ({
                  ...p,
                  metadata: {
                    ...p.metadata,
                    ...photoDetails(previous?.metadata || p.metadata),
                    modifications: p.metadata.modifications,
                  },
                })),
              );
              if (!keys?.length)
                throw Error(
                  'Another tab is processing photos. Resume this queue here first.',
                );
              if (replacesJob) store.remove(replacesJob);
              setTab('review');
              setMessage(
                'Optimised images queued for private upload. Review their final quality and details before adding to the map draft.',
              );
              if (replacesJob) {
                const next = store
                  .snapshot(target)
                  .find((j) => j.key === keys[0]);
                if (next) {
                  openPhotoEditor(next);
                  return true;
                }
              }
              return false;
            }}
          />
        </Suspense>
      )}
    </>
  );
}
