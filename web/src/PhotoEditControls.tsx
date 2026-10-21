import { PhotoRecipeSlider } from './PhotoRecipeSlider';
import { RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rotatePhoto } from './photo-edit';
import type { PhotoOptimizerState } from './usePhotoOptimizer';

export function PhotoEditControls({ state }: { state: PhotoOptimizerState }) {
  const { settingsTab, setTool, change, sourceUrl, current, tool } = state;
  if (!current) return null;

  return (
    <div hidden={settingsTab !== 'edit'}>
      <details>
        <summary>Crop &amp; orientation</summary>{' '}
        <select
          aria-label="Crop aspect ratio"
          defaultValue="free"
          onChange={(e) => {
            const aspect = Number(e.target.value);
            if (!aspect) {
              setTool('crop');
              return;
            }
            const image = new Image();
            image.onload = () => {
              const actual = image.width / image.height;
              change({
                crop:
                  actual > aspect
                    ? {
                        x: (1 - aspect / actual) / 2,
                        y: 0,
                        width: aspect / actual,
                        height: 1,
                      }
                    : {
                        x: 0,
                        y: (1 - actual / aspect) / 2,
                        width: 1,
                        height: actual / aspect,
                      },
                masks: [],
              });
            };
            image.src = sourceUrl;
          }}
        >
          <option value="free">Free crop</option>
          <option value="1">Square · 1:1</option>
          <option value="1.333333">Landscape · 4:3</option>
          <option value="1.777778">Wide · 16:9</option>
          <option value="0.75">Portrait · 3:4</option>
        </select>
        <Button
          variant="outline"
          onClick={() => {
            setTool('crop');
          }}
        >
          Draw crop
        </Button>
        <div className="photo-opt-fields">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              Crop {key} (%)
              <input
                type="number"
                min={key === 'width' || key === 'height' ? 1 : 0}
                max="100"
                value={Math.round(current.recipe.crop[key] * 100)}
                onChange={(e) => {
                  const next = {
                    ...current.recipe.crop,
                    [key]: Math.max(
                      key === 'width' || key === 'height' ? 0.01 : 0,
                      Math.min(1, Number(e.target.value) / 100),
                    ),
                  };
                  next.width = Math.min(next.width, 1 - next.x);
                  next.height = Math.min(next.height, 1 - next.y);
                  change({ crop: next, masks: [] });
                }}
              />
            </label>
          ))}
        </div>
        <div className="photo-opt-toolbar">
          <Button
            variant="outline"
            aria-label="Rotate left"
            onClick={() =>
              change({
                rotation: rotatePhoto(current.recipe.rotation, -90),
                masks: [],
              })
            }
          >
            <RotateCcw />
          </Button>
          <Button
            variant="outline"
            aria-label="Rotate right"
            onClick={() =>
              change({
                rotation: rotatePhoto(current.recipe.rotation, 90),
                masks: [],
              })
            }
          >
            <RotateCw />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              change({
                flipX: !current.recipe.flipX,
                masks: [],
              })
            }
          >
            Flip horizontal
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              change({
                flipY: !current.recipe.flipY,
                masks: [],
              })
            }
          >
            Flip vertical
          </Button>
        </div>
        {
          <PhotoRecipeSlider
            label={'Straighten'}
            field={'rotation'}
            min={-180}
            max={180}
            step={1}
            recipe={current.recipe}
            change={change}
          />
        }
      </details>
      <details>
        <summary>Light &amp; colour</summary>
        {
          <PhotoRecipeSlider
            label={'Exposure'}
            field={'exposure'}
            min={-2}
            max={2}
            step={0.05}
            recipe={current.recipe}
            change={change}
          />
        }
        {
          <PhotoRecipeSlider
            label={'Contrast'}
            field={'contrast'}
            min={0}
            max={2}
            step={0.05}
            recipe={current.recipe}
            change={change}
          />
        }
        {
          <PhotoRecipeSlider
            label={'Saturation'}
            field={'saturation'}
            min={0}
            max={2}
            step={0.05}
            recipe={current.recipe}
            change={change}
          />
        }
        {
          <PhotoRecipeSlider
            label={'Temperature'}
            field={'temperature'}
            min={-1}
            max={1}
            step={0.05}
            recipe={current.recipe}
            change={change}
          />
        }
      </details>
      <details>
        <summary>Privacy areas ({current.recipe.masks.length})</summary>
        <p>
          Draw on the preview. Use solid redaction for sensitive information.
          Geometry changes require privacy areas to be marked again.
        </p>
        <div className="photo-opt-toolbar">
          {(['blur', 'pixelate', 'redact'] as const).map((t) => (
            <Button
              key={t}
              disabled={!current.output}
              title={
                !current.output
                  ? 'Preview changes before marking an area on the edited image'
                  : undefined
              }
              variant={tool === t ? 'default' : 'outline'}
              onClick={() => {
                setTool(t);
              }}
            >
              {t}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => change({ masks: [] })}>
            Clear areas
          </Button>
          <Button
            variant="outline"
            disabled={!current.output || current.recipe.masks.length >= 50}
            onClick={() =>
              change({
                masks: [
                  ...current.recipe.masks,
                  {
                    x: 0.25,
                    y: 0.25,
                    width: 0.25,
                    height: 0.25,
                    mode: 'redact',
                  },
                ],
              })
            }
          >
            Add redaction with coordinates
          </Button>
        </div>
        {!current.output && <p>Preview changes before adding privacy areas.</p>}
        {current.recipe.masks.map((mask, index) => (
          <fieldset key={index}>
            <legend>Area {index + 1}</legend>
            <div className="photo-opt-fields">
              {(['x', 'y', 'width', 'height'] as const).map((key) => (
                <label key={key}>
                  {key} (%)
                  <input
                    aria-label={`Area ${index + 1} ${key} (%)`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(mask[key] * 1000) / 10}
                    onChange={(e) =>
                      change({
                        masks: current.recipe.masks.map((m, i) =>
                          i === index
                            ? {
                                ...m,
                                [key]: Number(e.target.value) / 100,
                              }
                            : m,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={() =>
                change({
                  masks: current.recipe.masks.filter((_, i) => i !== index),
                })
              }
            >
              Remove area {index + 1}
            </Button>
          </fieldset>
        ))}
      </details>

      <details>
        <summary>Resize</summary>
        <label>
          Longest edge (px)
          <input
            type="number"
            min="64"
            max="4096"
            value={current.recipe.width}
            onChange={(e) => change({ width: Number(e.target.value) })}
          />
        </label>
        <p>Preserves proportions. Images are never enlarged.</p>
      </details>
    </div>
  );
}
