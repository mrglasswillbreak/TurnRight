import { PhotoRecipeSlider } from './PhotoRecipeSlider';
import { type PhotoRecipe } from './photo-edit';
import type { PhotoOptimizerState } from './usePhotoOptimizer';

export function PhotoCompressionControls({
  state,
}: {
  state: PhotoOptimizerState;
}) {
  const { settingsTab, current, change } = state;
  if (!current) return null;

  return (
    <div hidden={settingsTab !== 'compress'}>
      <h4>Compress</h4>
      <label>
        <span className="sr-only">Download format</span>
        <select
          aria-label="Download format"
          value={current.recipe.format}
          onChange={(e) =>
            change({
              format: e.target.value as PhotoRecipe['format'],
            })
          }
        >
          <option value="image/webp">WebP</option>
          <option value="image/jpeg">MozJPEG</option>
          <option value="image/png">OxiPNG · lossless</option>
          <option value="image/avif">AVIF</option>
        </select>
      </label>
      {current.recipe.format !== 'image/png' &&
        !(
          current.recipe.format === 'image/webp' && current.recipe.lossless
        ) && (
          <PhotoRecipeSlider
            label={'Quality'}
            field={'quality'}
            min={0.1}
            max={1}
            step={0.01}
            recipe={current.recipe}
            change={change}
          />
        )}
      <details>
        <summary>Advanced settings</summary>
        {current.recipe.format === 'image/webp' && (
          <label className="photo-check">
            <input
              type="checkbox"
              checked={!!current.recipe.lossless}
              onChange={(e) => change({ lossless: e.target.checked })}
            />
            Lossless
          </label>
        )}
        {current.recipe.format === 'image/jpeg' && (
          <label className="photo-check">
            <input
              type="checkbox"
              checked={current.recipe.progressive !== false}
              onChange={(e) => change({ progressive: e.target.checked })}
            />
            Progressive JPEG
          </label>
        )}
        {current.recipe.format !== 'image/jpeg' && (
          <label>
            Compression effort
            <input
              type="range"
              min="0"
              max="6"
              step="1"
              value={
                current.recipe.effort ??
                (current.recipe.format === 'image/webp' ? 4 : 2)
              }
              onChange={(e) => change({ effort: Number(e.target.value) })}
            />
            <small>Higher effort takes longer.</small>
          </label>
        )}
        <label>
          Target size (KiB; 0 = no target)
          <input
            type="number"
            min="0"
            max="10240"
            value={current.recipe.targetKiB}
            onChange={(e) => change({ targetKiB: Number(e.target.value) })}
          />
        </label>
        <label>
          Minimum quality
          <input
            type="range"
            min=".1"
            max="1"
            step=".01"
            value={current.recipe.minQuality ?? 0.65}
            onChange={(e) => change({ minQuality: Number(e.target.value) })}
          />
          <output>
            {Math.round((current.recipe.minQuality ?? 0.65) * 100)}
          </output>
        </label>
        <p>
          A size target may lower quality to this floor. Actual output quality:{' '}
          {Math.round((current.outputQuality ?? current.recipe.quality) * 100)}.
        </p>
      </details>
    </div>
  );
}
