import { Unlink } from 'lucide-react';
import type { EditorInspectorState } from './useEditorInspector';

export function InspectorPathProperties({
  state: viewState,
}: {
  state: EditorInspectorState;
}) {
  const { edit, p, onProperty, onPick, onDisconnect } = viewState;

  return (
    <>
      {edit.kind === 'path' && (
        <>
          <label className="field-label">
            Walking direction
            <select
              value={String(p.footDirection || 'both')}
              onChange={(e) => onProperty('footDirection', e.target.value)}
            >
              <option value="both">Both directions</option>
              <option value="forward">Along the drawn line</option>
              <option value="reverse">Against the drawn line</option>
            </select>
          </label>
          <label className="field-label">
            Recorded steps information
            <select
              value={
                p.steps === true ? 'yes' : p.steps === false ? 'no' : 'unknown'
              }
              onChange={(e) =>
                onProperty(
                  'steps',
                  e.target.value === 'unknown'
                    ? null
                    : e.target.value === 'yes',
                )
              }
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Includes steps</option>
              <option value="no">Recorded without steps</option>
            </select>
          </label>
          <div className="editor-field-title">Path connections</div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.autoConnectCrossings !== false}
              onChange={(e) =>
                onProperty('autoConnectCrossings', e.target.checked)
              }
            />
            Connect crossings automatically
          </label>
          <label className="field-label">
            Crossing level
            <select
              value={String(p.crossingLevel || 'source')}
              onChange={(e) => onProperty('crossingLevel', e.target.value)}
            >
              <option value="source">
                Use mapped level (ground if unknown)
              </option>
              <option value="ground">Ground</option>
              <option value="bridge">Bridge / above ground</option>
              <option value="tunnel">Tunnel / below ground</option>
            </select>
          </label>
          <div className="editor-two-buttons">
            <button
              className="editor-secondary"
              onClick={() => onPick('start')}
            >
              Connect start
            </button>
            <button className="editor-secondary" onClick={() => onPick('end')}>
              Connect end
            </button>
          </div>
          <button className="editor-secondary" onClick={() => onPick('join')}>
            Join here · click a crossing
          </button>
          {p.connections?.map((c, i) => (
            <div className="editor-connection" key={`${c.vertexId}:${i}`}>
              <span>
                Connected{' '}
                {p.vertexIds?.[0] === c.vertexId
                  ? 'start'
                  : p.vertexIds?.at(-1) === c.vertexId
                    ? 'end'
                    : 'junction'}
              </span>
              <button
                className="editor-icon"
                aria-label={`Disconnect connection ${i + 1}`}
                onClick={() => onDisconnect(c.vertexId)}
              >
                <Unlink size={15} />
              </button>
            </div>
          ))}
          <p className="small-note">
            Crossings at the same level connect automatically. Turn this off to
            choose connections with Connect start, Connect end or Join here.
            Existing manual connections are retained.
          </p>
        </>
      )}
    </>
  );
}
