import { useState } from 'react';
import type { MapEdit } from './types';
import type { EditorWorkspace } from './editor-workspace';
import { canonical, type ConflictChoices } from './editor-conflicts';
import { api } from './supabase';
import { AdminRequestError } from './admin-client';

export function EditorConflictReview({
  workspace,
  server,
  close,
  resolved,
  compare,
  onSignIn,
}: {
  workspace: EditorWorkspace;
  server: MapEdit[];
  close: () => void;
  resolved: () => void;
  compare: (local?: MapEdit, remote?: MapEdit) => void;
  onSignIn: () => Promise<void>;
}) {
  const [remote, setRemote] = useState(server);
  const [localStamp, setLocalStamp] = useState(canonical(workspace.edits));
  const [choices, setChoices] = useState<ConflictChoices>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState(false);
  const review = workspace.reviewConflicts(remote, choices);
  const stale = localStamp !== canonical(workspace.edits);
  return (
    <aside
      className="editor-conflicts editor-card"
      aria-label="Review draft conflicts"
    >
      <div className="editor-panel-heading">
        <h2>Review draft conflicts</h2>
        <button className="editor-text" onClick={close}>
          Close
        </button>
      </div>
      <p>
        Unrelated field changes are combined. Choose which version to keep for
        each conflict. Geometry and its connections stay together.
      </p>
      {review.conflicts.map((conflict) => (
        <fieldset className="change-card" key={conflict.key}>
          <legend>
            {conflict.name} · {conflict.field}
          </legend>
          <div className="conflict-values">
            {(['base', 'local', 'server'] as const).map((side) => (
              <details key={side} open={typeof conflict[side] !== 'object'}>
                <summary>
                  {side === 'base'
                    ? 'Original'
                    : side === 'local'
                      ? 'My changes'
                      : 'Server version'}
                </summary>
                <pre>
                  {JSON.stringify(conflict[side], null, 2) ?? 'Not present'}
                </pre>
              </details>
            ))}
          </div>
          <button
            className="editor-text"
            onClick={() =>
              compare(
                workspace.edits.find(
                  (e) =>
                    e.id === conflict.featureId &&
                    e.kind === conflict.featureKind,
                ),
                remote.find(
                  (e) =>
                    e.id === conflict.featureId &&
                    e.kind === conflict.featureKind,
                ),
              )
            }
          >
            Compare on map
          </button>
          {(['local', 'server'] as const).map((side) => (
            <label className="checkbox-label" key={side}>
              <input
                type="radio"
                name={conflict.key}
                checked={choices[conflict.key] === side}
                onChange={() =>
                  setChoices({ ...choices, [conflict.key]: side })
                }
              />
              {side === 'local' ? 'Keep my value' : 'Keep server value'}
            </label>
          ))}
        </fieldset>
      ))}
      {!review.conflicts.length && (
        <p>No conflicting fields. Independent changes can be combined.</p>
      )}
      {stale && (
        <p className="notice">
          Local work changed. Refresh this review before applying it.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
          {authError && (
            <button className="editor-text" onClick={() => void onSignIn()}>
              Sign in again
            </button>
          )}
        </p>
      )}
      <div className="button-row">
        <button
          className="editor-secondary"
          disabled={busy}
          onClick={() => {
            setLocalStamp(canonical(workspace.edits));
            setChoices({});
          }}
        >
          Review current local changes
        </button>
        <button
          className="editor-primary"
          disabled={busy || stale || !!review.unresolved.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            setAuthError(false);
            try {
              const latest = await api<{ edits: MapEdit[] }>('state');
              if (
                canonical(latest.edits) !== canonical(remote) ||
                localStamp !== canonical(workspace.edits)
              ) {
                setRemote(latest.edits);
                setLocalStamp(canonical(workspace.edits));
                setChoices({});
                setError(
                  'The draft changed again. Review the latest versions.',
                );
                return;
              }
              if (workspace.reconcile(latest.edits, true, choices)) {
                await workspace.flush();
                resolved();
              }
            } catch (e) {
              setError((e as Error).message);
              setAuthError(
                e instanceof AdminRequestError && e.reason === 'auth',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Checking latest draft…' : 'Apply reviewed choices'}
        </button>
      </div>
    </aside>
  );
}
