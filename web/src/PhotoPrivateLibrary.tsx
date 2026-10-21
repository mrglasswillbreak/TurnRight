import { PhotoImage } from './photo-manager-cards';
import type { PhotoManagerState } from './usePhotoManager';

export function PhotoPrivateLibrary({ state }: { state: PhotoManagerState }) {
  const {
    tab,
    loadLibrary,
    query,
    setQuery,
    queue,
    busy,
    library,
    name,
    recover,
    loadingLibrary,
    libraryOffset,
    nextOffset,
  } = state;

  return (
    <>
      {tab === 'private' && (
        <>
          <form
            className="photo-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void loadLibrary();
            }}
          >
            <label>
              Search private uploads
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
              />
            </label>
            <button disabled={!queue.editable || busy === 'attach'}>
              Search
            </button>
          </form>
          <p>
            Private uploads are not published automatically. Choose one to
            resume its review.
          </p>
          <div className="photo-grid">
            {library.map((item) => (
              <article className="photo-card" key={item.id}>
                {item.metadata?.sha256 ? (
                  <PhotoImage
                    photo={{
                      ...item.metadata,
                      id: `owner:${item.id}`,
                      url: item.previewUrl,
                      alt:
                        item.metadata?.alt || item.filename || 'Private photo',
                    }}
                  />
                ) : (
                  <p>Preview available after processing</p>
                )}
                <h3>
                  {item.draft?.caption ||
                    item.metadata?.caption ||
                    item.filename ||
                    'Private photo'}
                </h3>
                <p>
                  {name(item.draft?.buildingId || item.metadata?.buildingId)} ·{' '}
                  {item.status === 'approved'
                    ? 'Previously approved'
                    : item.status === 'processed'
                      ? 'Needs review'
                      : 'Upload unfinished'}
                </p>
                <button
                  disabled={!queue.editable || busy === 'attach'}
                  onClick={() => void recover(item)}
                >
                  Resume review
                </button>
              </article>
            ))}
          </div>
          {loadingLibrary && <output>Loading private uploads…</output>}
          {!loadingLibrary && !library.length && (
            <p>No private photos found.</p>
          )}
          {libraryOffset > 0 && (
            <button
              onClick={() => void loadLibrary(Math.max(0, libraryOffset - 20))}
            >
              Previous page
            </button>
          )}
          {nextOffset !== null && (
            <button
              disabled={!queue.editable || busy === 'attach'}
              onClick={() => void loadLibrary(nextOffset)}
            >
              Next page
            </button>
          )}
        </>
      )}
    </>
  );
}
