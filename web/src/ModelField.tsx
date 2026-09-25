import { useEffect, useId, useRef, useState } from 'react';
import type { EditorWorkspace } from './editor-workspace';
import { useModelMobile } from './model-mobile';
const display = (value: string | number, step: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(
        Number(
          value.toFixed(Math.min(8, Math.max(0, Math.ceil(-Math.log10(step))))),
        ),
      )
    : String(value);
type ModelFieldProps = {
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
};
/** Bind unfinished input to its entity, even when React reuses a properties panel. */
export function ModelField(props: ModelFieldProps) {
  return (
    <ModelFieldInput key={`${props.buildingId}:${props.field}`} {...props} />
  );
}
/** A field's intermediate text is not a geometry command. Never coerce blank input to zero. */
function ModelFieldInput({
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
}: ModelFieldProps) {
  const { compact } = useModelMobile();
  const errorId = useId();
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
  const save = (nextText = text) => {
    if (!dirty.current) return;
    if (
      type === 'number' &&
      (!nextText.trim() ||
        !Number.isFinite(Number(nextText)) ||
        (min !== undefined && Number(nextText) < min) ||
        (max !== undefined && Number(nextText) > max))
    ) {
      setError(
        `Enter ${label.toLowerCase()}${min !== undefined ? ` ≥ ${min}` : ''}${max !== undefined ? ` and ≤ ${max}` : ''}.`,
      );
      return;
    }
    if (onCommit(nextText)) {
      clear();
      setError('');
    } else
      setError(
        'Change retained locally. Resolve the reported validation error before saving.',
      );
  };
  return (
    <label className="model-field">
      {label}
      <span
        className={
          compact && type === 'number' ? 'model-field-stepper' : undefined
        }
      >
        {compact && type === 'number' && (
          <button
            type="button"
            disabled={
              disabled || !text.trim() || !Number.isFinite(Number(text))
            }
            aria-label={`Decrease ${label.toLowerCase()}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              const next = display(Number(text) - step, step);
              setText(next);
              dirty.current = true;
              workspace?.recoverModelInput(buildingId, field, next);
              save(next);
            }}
          >
            −
          </button>
        )}
        <input
          data-model-field={field}
          type={type}
          value={text}
          min={min}
          max={max}
          step={step}
          inputMode={type === 'number' ? 'decimal' : undefined}
          enterKeyHint="done"
          disabled={disabled}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
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
              if (compact) e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              clear();
              setText(display(value, step));
              setError('');
            }
          }}
        />
        {compact && type === 'number' && (
          <button
            type="button"
            disabled={
              disabled || !text.trim() || !Number.isFinite(Number(text))
            }
            aria-label={`Increase ${label.toLowerCase()}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              const next = display(Number(text) + step, step);
              setText(next);
              dirty.current = true;
              workspace?.recoverModelInput(buildingId, field, next);
              save(next);
            }}
          >
            +
          </button>
        )}
      </span>
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
