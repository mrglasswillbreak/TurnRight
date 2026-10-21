import { WorkspacePane } from './WorkspaceFrame';
import { HardDrive, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { removeLocalPhoto } from './photo-local';
import { bytes } from './photo-optimizer-utils';
import type { PhotoOptimizerState } from './usePhotoOptimizer';

export function PhotoLocalDrafts({ state }: { state: PhotoOptimizerState }) {
  const {
    widePhoto,
    panel,
    setPanel,
    items,
    busy,
    selected,
    setSelected,
    setPast,
    setFuture,
    setPreviewPaused,
    setTool,
    prepare,
    prepared,
    current,
    save,
    render,
    protectedIds,
    previewController,
    pending,
    owner,
    setItems,
    setError,
  } = state;

  return (
    <>
      {(widePhoto || panel === 'files') && (
        <WorkspacePane id="left" title="Photographs" enabled={widePhoto}>
          <section
            className="photo-floating-panel photo-files-panel"
            aria-label="Local images and offline tools"
          >
            <h3>
              Local images{' '}
              <button
                aria-label="Collapse local images"
                onClick={() => setPanel(null)}
              >
                <ChevronDown />
              </button>
            </h3>
            <div className="photo-panel-scroll">
              <nav aria-label="Local image drafts">
                {items.map((p) => (
                  <button
                    disabled={busy}
                    aria-pressed={selected === p.id}
                    key={p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setPast([]);
                      setFuture([]);
                      setPreviewPaused(false);
                      setTool('navigate');
                    }}
                  >
                    {p.filename}
                    <small>
                      {bytes(p.source.size)}
                      {p.output
                        ? ' → ' + bytes(p.output.size)
                        : ' · Original retained'}
                    </small>
                  </button>
                ))}
              </nav>
              {!items.length && (
                <p>No local photos. Add photos from the gallery.</p>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void prepare()}
              >
                <HardDrive />
                {prepared ? 'Ready offline' : 'Prepare for offline use'}
              </Button>
              <p>
                {items.length} images ·{' '}
                {bytes(
                  items.reduce(
                    (n, p) => n + p.source.size + (p.output?.size || 0),
                    0,
                  ),
                )}{' '}
                stored for this gallery.
              </p>
              <details>
                <summary>Batch tools</summary>
                <div className="photo-batch-tools">
                  {' '}
                  <Button
                    variant="outline"
                    disabled={busy || !current || items.length < 2}
                    onClick={() => {
                      for (const p of items)
                        save({
                          ...p,
                          recipe: {
                            ...p.recipe,
                            width: current!.recipe.width,
                            quality: current!.recipe.quality,
                            targetKiB: current!.recipe.targetKiB,
                            format: current!.recipe.format,
                          },
                          output: undefined,
                        });
                    }}
                  >
                    Apply compression settings to batch
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !items.length}
                    onClick={() => void render(items, false)}
                  >
                    Optimise batch
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !items.length}
                    onClick={() => void render(items, true)}
                  >
                    Use batch for map
                  </Button>
                </div>
              </details>
              {current && (
                <Button
                  variant="destructive"
                  disabled={busy || protectedIds.includes(current.id)}
                  title={
                    protectedIds.includes(current.id)
                      ? 'Remove this image from the upload queue first'
                      : undefined
                  }
                  onClick={() => {
                    previewController.current?.abort();
                    void pending.current
                      .then(() => removeLocalPhoto(owner, current.id))
                      .then(() => {
                        setItems((v) => v.filter((p) => p.id !== current.id));
                        setSelected(
                          items.find((p) => p.id !== current.id)?.id || '',
                        );
                      })
                      .catch((e) => setError(e.message));
                  }}
                >
                  Remove local files
                </Button>
              )}
              <p>
                Powered by{' '}
                <a
                  href="https://github.com/GoogleChromeLabs/squoosh"
                  target="_blank"
                  rel="noreferrer"
                >
                  Squoosh codecs
                </a>
                .{' '}
                <a
                  href="/photo-codecs/e8d35e0/README.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Licences
                </a>
              </p>
            </div>
          </section>
        </WorkspacePane>
      )}
    </>
  );
}
