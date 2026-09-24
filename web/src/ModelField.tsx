import { useEffect, useRef, useState } from 'react';
import type { EditorWorkspace } from './editor-workspace';
const display = (value: string | number, step: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(
        Number(
          value.toFixed(Math.min(8, Math.max(0, Math.ceil(-Math.log10(step))))),
        ),
      )
    : String(value);
/** A field's intermediate text is not a geometry command. Never coerce blank input to zero. */
export function ModelField({
  label,
  value,
  field,
  buildingId,
  workspace,
  onCommit,
  type = 'number',
  min,
  max,
  step = 0.01,
  disabled = false,
}: {
  label: string;
  value: string | number;
  field: string;
  buildingId: string;
  workspace?: EditorWorkspace;
  onCommit: (value: string) => boolean;
  type?: 'number' | 'text' | 'color';
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const recovered = workspace?.modelInputs[buildingId]?.[field];
  const [text, setText] = useState(recovered ?? display(value, step)),
    [error, setError] = useState('');
  const focused = useRef(false),
    dirty = useRef(recovered !== undefined);
  const previousRecovery = useRef(recovered);
  useEffect(() => {
    // A workspace-level discard must also clear an already mounted field.
    if (
      previousRecovery.current !== undefined &&
      recovered === undefined &&
      dirty.current
    ) {
      dirty.current = false;
      setText(display(value, step));
      setError('');
    }
    previousRecovery.current = recovered;
  }, [recovered, value, step]);
  useEffect(() => {
    if (!dirty.current && !focused.current) setText(display(value, step));
  }, [value, step]);
  const clear = () => {
    dirty.current = false;
    workspace?.recoverModelInput(buildingId, field);
  };
  const save = () => {
    if (!dirty.current) return;
    if (
      type === 'number' &&
      (!text.trim() ||
        !Number.isFinite(Number(text)) ||
        (min !== undefined && Number(text) < min) ||
        (max !== undefined && Number(text) > max))
    ) {
      setError(
        `Enter ${label.toLowerCase()}${min !== undefined ? ` ≥ ${min}` : ''}${max !== undefined ? ` and ≤ ${max}` : ''}.`,
      );
      return;
    }
    if (onCommit(text)) {
      clear();
      setError('');
    } else
      setError(
        'Change retained locally. Resolve the highlighted placement before saving.',
      );
  };
  return (
    <label className="model-field">
      {label}
      <input
        type={type}
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={!!error}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setText(e.target.value);
          dirty.current = true;
          setError('');
          workspace?.recoverModelInput(buildingId, field, e.target.value);
        }}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            clear();
            setText(display(value, step));
            setError('');
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
