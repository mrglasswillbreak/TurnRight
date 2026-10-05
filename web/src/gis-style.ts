import type { DatasetStyle, FieldValue } from './gis-types.js';
export function gisStyle(
  style: DatasetStyle,
  values: Record<string, FieldValue>,
) {
  const value = style.field ? values[style.field] : null;
  const category =
    style.mode === 'categorical'
      ? style.classes?.find((c) => c.value === value)
      : style.mode === 'graduated' && typeof value === 'number'
        ? [...(style.classes || [])]
            .sort((a, b) => (a.maximum ?? Infinity) - (b.maximum ?? Infinity))
            .find((c) => value <= (c.maximum ?? Infinity))
        : undefined;
  const size = style.sizeField ? values[style.sizeField] : undefined;
  return {
    color: category?.color || style.color,
    pointSize:
      typeof size === 'number'
        ? Math.max(3, Math.min(30, Math.sqrt(Math.max(0, size))))
        : 6,
    lineWidth: 2,
    opacity: 0.7,
    labels: !!style.labelField,
    labelField: 'label' as const,
  };
}
