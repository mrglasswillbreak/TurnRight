import { WorkspacePane } from './WorkspaceFrame';
import { ChevronDown } from 'lucide-react';
import { bytes } from './photo-optimizer-utils';
import type { PhotoOptimizerState } from './usePhotoOptimizer';

export function PhotoOptimizerDetails({
  state,
}: {
  state: PhotoOptimizerState;
}) {
  const { current, panel, widePhoto, setPanel, setSettingsTab, details } =
    state;

  return (
    <>
      {current && panel === 'details' && (
        <WorkspacePane id="right" title="Photo details" enabled={widePhoto}>
          <section
            className="photo-floating-panel photo-details-panel"
            aria-label="Photo metadata"
          >
            <h3>
              Photo details{' '}
              <button
                aria-label="Collapse photo details"
                onClick={() => setPanel(null)}
              >
                <ChevronDown />
              </button>
            </h3>
            <div className="photo-panel-scroll">
              <nav className="photo-inspector-tabs" aria-label="Photo tools">
                <button
                  onClick={() => {
                    setSettingsTab('edit');
                    setPanel('edit');
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setSettingsTab('compress');
                    setPanel('edit');
                  }}
                >
                  Compress
                </button>
                <button aria-pressed="true">Details</button>
              </nav>
              {details || (
                <dl>
                  <dt>File</dt>
                  <dd>{current.filename}</dd>
                  <dt>Original</dt>
                  <dd>
                    {current.source.type} · {bytes(current.source.size)}
                  </dd>
                  <dt>Edited dimensions</dt>
                  <dd>
                    {current.width && current.height
                      ? `${current.width} × ${current.height}`
                      : 'Preview pending'}
                  </dd>
                  <dt>Storage</dt>
                  <dd>Private copy on this device</dd>
                </dl>
              )}
            </div>
          </section>
        </WorkspacePane>
      )}
    </>
  );
}
