import { useState } from 'react';
import type { DatasetField, FieldValue } from './gis-types';
import { valueErrors } from './gis-contracts';
export function AttributeCell({
  field,
  value,
  disabled,
  save,
}: {
  field: DatasetField;
  value: FieldValue;
  disabled: boolean;
  save: (value: string) => Promise<void>;
}) {
  const [text, setText] = useState(value === null ? '' : String(value)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const commit = async () => {
    const errors = valueErrors(
      field,
      text === ''
        ? null
        : field.type === 'number'
          ? Number(text)
          : field.type === 'boolean'
            ? text === 'true'
            : text,
    );
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await save(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choices = field.domain?.length
    ? field.domain
    : field.type === 'boolean'
      ? [true, false]
      : undefined;
  return (
    <>
      {choices ? (
        <select
          aria-label={field.alias || field.name}
          value={text}
          disabled={disabled || busy}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
        >
          <option value="">NULL</option>
          {choices
            .filter((v) => v !== null)
            .map((v) => (
              <option key={String(v)} value={String(v)}>
                {String(v)}
              </option>
            ))}
        </select>
      ) : (
        <input
          aria-label={field.alias || field.name}
          aria-invalid={!!error}
          value={text}
          disabled={disabled || busy}
          placeholder="NULL"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      )}
      {error && <small role="alert">{error}</small>}
    </>
  );
}
