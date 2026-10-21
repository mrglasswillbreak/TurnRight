import { Download, ChevronUp, ChevronDown } from 'lucide-react';
import { bytes } from './photo-optimizer-utils';
import type { PhotoOptimizerState } from './usePhotoOptimizer';

export function PhotoOptimizerResult({
  state,
}: {
  state: PhotoOptimizerState;
}) {
  const { current, panel, setPanel, download, saving, busy, outputName } =
    state;

  return (
    <>
      {current && (
        <>
          <div className="photo-result photo-result-original">
            <button
              className="photo-result-toggle"
              aria-label="Show original image and local files"
              aria-expanded={panel === 'files'}
              onClick={() => setPanel((p) => (p === 'files' ? null : 'files'))}
            >
              {panel === 'files' ? <ChevronDown /> : <ChevronUp />}
            </button>
            <span className="photo-result-meta">
              {bytes(current.source.size)}
              <small className="photo-result-label">Original</small>
              <small className="photo-result-name">{current.filename}</small>
            </span>
            <span className="photo-original-saving" aria-hidden="true">
              0%
            </span>
            <button
              className="photo-original-download"
              aria-label="Download original"
              title="Download original"
              onClick={() => download(current.source, current.filename)}
            >
              <Download />
            </button>
          </div>
          <div className="photo-result photo-result-output">
            <button
              className="photo-result-toggle"
              aria-label="Show compression settings"
              aria-expanded={panel === 'edit'}
              onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
            >
              {panel === 'edit' ? <ChevronDown /> : <ChevronUp />}
            </button>
            <span className="photo-result-meta" aria-live="polite">
              {current.output ? bytes(current.output.size) : 'Encoding…'}
              <small className="photo-result-format">
                {
                  {
                    'image/webp': 'WebP',
                    'image/jpeg': 'MozJPEG',
                    'image/png': 'OxiPNG',
                    'image/avif': 'AVIF',
                  }[current.recipe.format]
                }
              </small>
              <small className="photo-result-dimensions">
                {current.output
                  ? current.width + ' × ' + current.height
                  : 'Edited'}
              </small>
            </span>
            <span className="photo-saving">
              {current.output
                ? (saving >= 0 ? '↓ ' : '↑ ') +
                  Math.abs(saving).toFixed(1) +
                  '%'
                : '…'}
            </span>
            <button
              aria-label="Download edited image"
              title="Download edited image"
              disabled={!current.output || busy}
              onClick={() =>
                current.output && download(current.output, outputName)
              }
            >
              <Download />
            </button>
          </div>
        </>
      )}
    </>
  );
}
