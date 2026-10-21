import { photoDetails } from './photo-details';
import { PhotoImage, StableCard, Pages } from './photo-manager-cards';
import type { PhotoManagerState } from './usePhotoManager';

export function PhotoUploadQueue({ state }: { state: PhotoManagerState }) {
  const {
    open,
    reviewVisited,
    tab,
    queue,
    queuePage,
    selected,
    shared,
    attaching,
    setSelected,
    setFieldErrors,
    patch,
    busy,
    setShared,
    setQueuePage,
    optimizing,
    reviewForm,
  } = state;

  return (
    <>
      {open && (reviewVisited || tab === 'review') && (
        <div hidden={tab !== 'review'}>
          {!queue.jobs.length && (
            <p>
              No unfinished photos. Choose Gallery → Add photos to get started.
            </p>
          )}
          <div className="photo-review-layout">
            <aside aria-label="Upload queue">
              {queue.jobs
                .slice(queuePage * 20, (queuePage + 1) * 20)
                .map((item) => (
                  <StableCard
                    key={item.key}
                    value={item}
                    detail={`${selected === item.key}:${shared.includes(item.key)}:${attaching.includes(item.key)}:${queue.editable}`}
                  >
                    <div className="photo-queue-card">
                      <button
                        aria-pressed={selected === item.key}
                        onClick={() => {
                          setSelected(item.key);
                          setFieldErrors({});
                        }}
                      >
                        <PhotoImage
                          previewOnly
                          photo={{
                            ...item.metadata,
                            id: item.mediaId
                              ? `owner:${item.mediaId}`
                              : undefined,
                            url: item.previewUrl,
                            alt: '',
                          }}
                          onUrl={(url) => patch(item.key, { previewUrl: url })}
                        />
                        <span>
                          {item.filename}
                          <small>
                            {item.state}
                            {item.mediaId &&
                            item.savedDetails ===
                              JSON.stringify(photoDetails(item.metadata))
                              ? ' · Saved privately'
                              : ''}
                          </small>
                        </span>
                      </button>
                      {item.error && <p role="alert">{item.error}</p>}
                      <div className="photo-actions">
                        {item.error && item.state !== 'failed' && (
                          <button
                            onClick={() =>
                              queue.patch(item.key, {
                                error: undefined,
                              })
                            }
                          >
                            Retry private save / preview
                          </button>
                        )}
                        {item.state === 'failed' && (
                          <>
                            <button onClick={() => queue.retry(item.key)}>
                              Retry processing
                            </button>
                            <label>
                              Reselect file
                              <input
                                aria-label={`Reselect ${item.filename}`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) =>
                                  queue.retry(item.key, e.target.files?.[0])
                                }
                              />
                            </label>
                          </>
                        )}
                        <button
                          disabled={
                            !queue.editable ||
                            busy === 'attach' ||
                            ['processing', 'uploading'].includes(item.state)
                          }
                          onClick={() => queue.remove(item.key)}
                        >
                          Remove from queue
                        </button>
                        <label>
                          <input
                            type="checkbox"
                            checked={shared.includes(item.key)}
                            onChange={(e) =>
                              setShared((s) =>
                                e.target.checked
                                  ? [...s, item.key]
                                  : s.filter((k) => k !== item.key),
                              )
                            }
                          />
                          Use shared credits
                        </label>
                      </div>
                    </div>
                  </StableCard>
                ))}
              <Pages
                page={queuePage}
                count={queue.jobs.length}
                onPage={setQueuePage}
                label="Uploads"
              />
            </aside>
            {!optimizing && reviewForm}
          </div>
        </div>
      )}
    </>
  );
}
