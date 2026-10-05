import { useState } from 'react';
import type {
  Dataset,
  DatasetField,
  DatasetStyle,
  FeatureQuery,
  FieldValue,
} from './gis-types';
import { schemaErrors } from './gis-contracts';
export default function GisSchema({
  dataset,
  query,
  save,
}: {
  dataset: Dataset;
  query: FeatureQuery;
  save: (next: Dataset) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(structuredClone(dataset)),
    [newName, setNewName] = useState(''),
    [filterName, setFilterName] = useState(''),
    [domains, setDomains] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const updateClass = (
    index: number,
    patch: Partial<NonNullable<DatasetStyle['classes']>[number]>,
  ) =>
    setDraft((d) => ({
      ...d,
      style: {
        ...d.style,
        classes: (d.style.classes || []).map((c, i) =>
          i === index ? { ...c, ...patch } : c,
        ),
      },
    }));
  const typed = (value: string, type?: DatasetField['type']): FieldValue => {
    if (type === 'number') {
      if (!value.trim() || !Number.isFinite(Number(value)))
        throw Error('Use a finite number.');
      return Number(value);
    }
    if (type === 'boolean') {
      if (!['true', 'false'].includes(value))
        throw Error('Use true or false for boolean values.');
      return value === 'true';
    }
    return value;
  };
  const update = (index: number, patch: Partial<DatasetField>) =>
    setDraft((d) => ({
      ...d,
      schema: {
        ...d.schema,
        fields: d.schema.fields.map((f, i) =>
          i === index ? { ...f, ...patch } : f,
        ),
      },
    }));
  return (
    <details open>
      <summary>Schema, styling and publication fields</summary>
      {draft.revision !== dataset.revision && (
        <p role="alert">
          This dataset changed. Your form is retained.{' '}
          <button
            onClick={() => {
              setDraft(structuredClone(dataset));
              setDomains({});
            }}
          >
            Load current fields and styling
          </button>
        </p>
      )}
      <label>
        Dataset name
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        Analysis CRS (UTM, metres)
        <input
          value={draft.analysis_crs}
          onChange={(e) => setDraft({ ...draft, analysis_crs: e.target.value })}
        />
      </label>
      <div className="gis-table-scroll">
        <table>
          <thead>
            <tr>
              {[
                'Field',
                'Alias / unit',
                'Type',
                'Required',
                'Public',
                'Allowed values (one per line)',
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.schema.fields.map((f, i) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>
                  <input
                    aria-label={f.name + ' alias'}
                    value={f.alias || ''}
                    onChange={(e) => update(i, { alias: e.target.value })}
                  />
                  <input
                    aria-label={f.name + ' unit'}
                    value={f.unit || ''}
                    onChange={(e) => update(i, { unit: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={f.name + ' type'}
                    value={f.type}
                    onChange={(e) =>
                      update(i, {
                        type: e.target.value as DatasetField['type'],
                      })
                    }
                  >
                    {['text', 'number', 'boolean', 'date'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={f.name + ' required'}
                    checked={!!f.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={f.name + ' public'}
                    checked={!!f.public}
                    onChange={(e) => update(i, { public: e.target.checked })}
                  />
                </td>
                <td>
                  <textarea
                    rows={2}
                    aria-label={f.name + ' coded domain'}
                    value={
                      domains[f.name] ?? (f.domain || []).map(String).join('\n')
                    }
                    onChange={(e) =>
                      setDomains({ ...domains, [f.name]: e.target.value })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gis-toolbar">
        <input
          aria-label="New field name"
          placeholder="New field name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          onClick={() => {
            const schema = {
              ...draft.schema,
              fields: [
                ...draft.schema.fields,
                { name: newName, type: 'text' as const, public: false },
              ],
            };
            const errors = schemaErrors(schema);
            if (errors.length) setError(errors.join(' '));
            else {
              setDraft({ ...draft, schema });
              setNewName('');
            }
          }}
        >
          Add field
        </button>
      </div>
      <div className="gis-toolbar">
        <label>
          Style
          <select
            value={draft.style.mode}
            onChange={(e) =>
              setDraft({
                ...draft,
                style: {
                  ...draft.style,
                  mode: e.target.value as Dataset['style']['mode'],
                  classes: [],
                },
              })
            }
          >
            {['single', 'categorical', 'graduated'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Default color
          <input
            type="color"
            value={draft.style.color}
            onChange={(e) =>
              setDraft({
                ...draft,
                style: { ...draft.style, color: e.target.value },
              })
            }
          />
        </label>
        {(['field', 'labelField', 'sizeField'] as const).map((key) => (
          <label key={key}>
            {key === 'field'
              ? 'Classification field'
              : key === 'labelField'
                ? 'Label field'
                : 'Proportional size field'}
            <select
              value={draft.style[key] || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  style: { ...draft.style, [key]: e.target.value || undefined },
                })
              }
            >
              <option value="">None</option>
              {draft.schema.fields
                .filter(
                  (f) =>
                    (key !== 'sizeField' &&
                      !(key === 'field' && draft.style.mode === 'graduated')) ||
                    f.type === 'number',
                )
                .map((f) => (
                  <option key={f.name}>{f.name}</option>
                ))}
            </select>
          </label>
        ))}
      </div>
      {draft.style.mode !== 'single' && (
        <fieldset>
          <legend>Legend classes</legend>
          {(draft.style.classes || []).map((c, i) => (
            <div key={i} className="gis-toolbar">
              <label>
                {draft.style.mode === 'graduated'
                  ? 'Maximum value'
                  : 'Category'}
                <input
                  aria-label={`Class ${i + 1} value`}
                  type={draft.style.mode === 'graduated' ? 'number' : 'text'}
                  value={
                    draft.style.mode === 'graduated'
                      ? (c.maximum ?? '')
                      : String(c.value ?? '')
                  }
                  onChange={(e) => {
                    try {
                      updateClass(
                        i,
                        draft.style.mode === 'graduated'
                          ? { maximum: Number(e.target.value) }
                          : { value: e.target.value },
                      );
                      setError('');
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  aria-label={`Class ${i + 1} color`}
                  value={c.color}
                  onChange={(e) => updateClass(i, { color: e.target.value })}
                />
              </label>
              <label>
                Legend label
                <input
                  aria-label={`Class ${i + 1} label`}
                  value={c.label}
                  onChange={(e) => updateClass(i, { label: e.target.value })}
                />
              </label>
              <button
                aria-label={`Remove class ${i + 1}`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    style: {
                      ...d.style,
                      classes: d.style.classes?.filter((_, n) => n !== i),
                    },
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            disabled={(draft.style.classes?.length || 0) >= 25}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                style: {
                  ...d.style,
                  classes: [
                    ...(d.style.classes || []),
                    {
                      color: d.style.color,
                      label: '',
                      ...(d.style.mode === 'graduated'
                        ? { maximum: 0 }
                        : { value: '' }),
                    },
                  ],
                },
              }))
            }
          >
            Add legend class
          </button>
        </fieldset>
      )}
      <label>
        <input
          type="checkbox"
          checked={draft.included}
          onChange={(e) => setDraft({ ...draft, included: e.target.checked })}
        />
        Include dataset in the reviewed public map
      </label>
      <p>
        Arbitrary fields stay private until selected above. Public styles and
        labels must use selected public fields. Routing rules are controlled in
        Edit.
      </p>
      <div className="gis-toolbar">
        <input
          placeholder="Saved filter name"
          aria-label="Saved filter name"
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
        />
        <button
          disabled={!filterName.trim()}
          onClick={() => {
            setDraft({
              ...draft,
              saved_filters: [
                ...draft.saved_filters,
                { name: filterName, query },
              ],
            });
            setFilterName('');
          }}
        >
          Add current filter
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={busy}
        onClick={() => {
          setDraft(structuredClone(dataset));
          setDomains({});
          setError('');
        }}
      >
        Discard staged field/style changes
      </button>
      <button
        disabled={busy || draft.revision !== dataset.revision}
        onClick={async () => {
          setBusy(true);
          try {
            const schema = {
              ...draft.schema,
              fields: draft.schema.fields.map((field) => ({
                ...field,
                domain: (
                  domains[field.name] ??
                  (field.domain || []).map(String).join('\n')
                )
                  .split('\n')
                  .filter((value) => value.trim())
                  .map((value) => typed(value, field.type)),
              })),
            };
            const errors = schemaErrors(schema);
            if (errors.length) throw Error(errors.join(' '));
            const definition = draft.schema.fields.find(
              (f) => f.name === draft.style.field,
            );
            const classes =
              draft.style.mode === 'categorical'
                ? draft.style.classes?.map((c) => ({
                    ...c,
                    value: typed(String(c.value ?? ''), definition?.type),
                  }))
                : draft.style.classes;
            const saved = (await save({
              ...draft,
              schema,
              style: { ...draft.style, classes },
            })) as Dataset;
            if (saved?.revision !== undefined) setDraft(structuredClone(saved));
            setError('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save schema and style
      </button>
    </details>
  );
}
