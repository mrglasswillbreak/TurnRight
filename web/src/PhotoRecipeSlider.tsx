import type { PhotoRecipe } from './photo-edit';

export function PhotoRecipeSlider({
  label,
  field,
  min,
  max,
  step,
  recipe,
  change,
}: {
  label: string;
  field:
    | 'rotation'
    | 'exposure'
    | 'contrast'
    | 'saturation'
    | 'temperature'
    | 'quality';
  min: number;
  max: number;
  step: number;
  recipe: PhotoRecipe;
  change: (patch: Partial<PhotoRecipe>) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={recipe[field]}
        onChange={(e) => change({ [field]: Number(e.target.value) })}
      />
      <output>
        {field === 'quality'
          ? Math.round(recipe[field] * 100)
          : recipe[field].toFixed(2)}
      </output>
    </label>
  );
}
