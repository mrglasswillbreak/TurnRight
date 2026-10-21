import type { LayerStyle } from './campus-layer-types';
import type { LayerWorkspaceState } from './useLayerWorkspace';

export function LayerStyleSettings({ state }: { state: LayerWorkspaceState }) {
  const { draft, style, update } = state;
  if (!draft) return null;

  return (
    <fieldset>
      <legend>Style</legend>
      <div className="layer-style-grid">
        {(['color', 'darkColor', 'outline'] as const).map((k) => (
          <label key={k}>
            {k}
            <input
              type="color"
              value={draft.style[k] || '#78968b'}
              onChange={(e) => style({ [k]: e.target.value })}
            />
          </label>
        ))}
        {(
          ['opacity', 'lineWidth', 'pointSize', 'minZoom', 'maxZoom'] as const
        ).map((k) => (
          <label key={k}>
            {k}
            <input
              type="number"
              step={k === 'opacity' ? 0.1 : 1}
              min="0"
              value={draft.style[k] ?? ''}
              placeholder="Default"
              onChange={(e) =>
                style({
                  [k]: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
        ))}
      </div>
      <label>
        Point symbol
        <select
          value={draft.style.symbol || 'circle'}
          onChange={(e) =>
            style({
              symbol: e.target.value as LayerStyle['symbol'],
            })
          }
        >
          {['circle', 'square', 'diamond'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Label field
        <select
          value={draft.style.labelField || 'name'}
          onChange={(e) =>
            style({
              labelField: e.target.value as LayerStyle['labelField'],
            })
          }
        >
          {['name', 'label', 'sourceId', 'landClass', 'surface'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="layer-check">
        <input
          type="checkbox"
          checked={
            draft.style.labels ??
            ['overlay', 'path', 'place', 'entrance'].includes(draft.role)
          }
          onChange={(e) => style({ labels: e.target.checked })}
        />
        Show labels
      </label>
      <details>
        <summary>Classification rules ({draft.rules.length})</summary>
        {draft.rules.map((r, i) => (
          <div key={i} className="layer-rule">
            <select
              aria-label={`Rule ${i + 1} field`}
              value={r.field}
              onChange={(e) =>
                update({
                  rules: draft.rules.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          field: e.target.value as typeof r.field,
                        }
                      : x,
                  ),
                })
              }
            >
              {['landClass', 'surface', 'highway', 'vegetation'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              aria-label={`Rule ${i + 1} value`}
              value={r.value}
              onChange={(e) =>
                update({
                  rules: draft.rules.map((x, j) =>
                    j === i ? { ...x, value: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              aria-label={`Rule ${i + 1} colour`}
              type="color"
              value={r.style.color || '#78968b'}
              onChange={(e) =>
                update({
                  rules: draft.rules.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          style: {
                            ...x.style,
                            color: e.target.value,
                          },
                        }
                      : x,
                  ),
                })
              }
            />
            <button
              aria-label={`Remove rule ${i + 1}`}
              onClick={() =>
                update({
                  rules: draft.rules.filter((_, j) => j !== i),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          disabled={draft.rules.length >= 50}
          onClick={() =>
            update({
              rules: [
                ...draft.rules,
                { field: 'landClass', value: '', style: {} },
              ],
            })
          }
        >
          Add rule
        </button>
      </details>
      <button onClick={() => update({ style: {}, rules: [] })}>
        Reset to campus theme
      </button>
    </fieldset>
  );
}
