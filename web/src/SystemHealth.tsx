import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './supabase';

export interface ErrorGroup {
  fingerprint: string;
  event: string;
  component: string;
  dependency: string;
  status: number;
  revision: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  recent_count: number;
  last_reference: string | null;
  resolved_at: string | null;
}
interface Summary {
  checkedAt: string;
  groups: ErrorGroup[];
}

export default function SystemHealth() {
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortSignal | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending.current === signal) return;
    pending.current = signal;
    setBusy(true);
    try {
      const result = await api<Summary>('monitoring-list', {}, { signal });
      if (!signal.aborted) {
        setSummary(result);
        setError('');
      }
    } catch (failure) {
      if (!signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Monitoring is temporarily unavailable.',
        );
    } finally {
      if (pending.current === signal) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  const resolve = async (group: ErrorGroup) => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending.current === signal) return;
    pending.current = signal;
    setBusy(true);
    try {
      await api(
        'monitoring-resolve',
        { fingerprint: group.fingerprint, lastSeen: group.last_seen },
        { signal },
      );
      if (pending.current === signal) pending.current = null;
      await refresh();
    } catch (failure) {
      if (!signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not resolve this group.',
        );
    } finally {
      if (pending.current === signal) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  };
  const groups = summary?.groups || [];
  const active = groups.filter(
    (group) => !group.resolved_at && group.event !== 'monitoring-probe',
  );
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <output>
          {summary
            ? `${active.length} unresolved groups`
            : 'Checking monitoring…'}
        </output>
        <button disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert">
          {error} The last successful results may be out of date.
        </p>
      )}
      {summary && (
        <p>
          Last checked: {new Date(summary.checkedAt).toLocaleString()}. Showing
          the latest 100 groups.
        </p>
      )}
      {summary && groups.length === 0 && <p>No retained failures.</p>}
      {groups.map((group) => (
        <article
          key={group.fingerprint}
          className="rounded border p-3 grid gap-2"
        >
          <strong>
            {group.event === 'monitoring-probe'
              ? 'Monitoring delivery check'
              : `${group.component} failure (${group.status})`}
          </strong>
          {!group.resolved_at &&
            group.event !== 'monitoring-probe' &&
            group.recent_count >= 5 && (
              <p role="alert">
                Repeated failure: {group.recent_count} occurrences in the
                current five-minute window.
              </p>
            )}
          <p>
            {group.occurrences} occurrences · Last seen{' '}
            {new Date(group.last_seen).toLocaleString()}
          </p>
          <p>
            Dependency: {group.dependency} · Revision:{' '}
            {group.revision.slice(0, 12)}
          </p>
          {group.last_reference && (
            <p className="break-all">Reference: {group.last_reference}</p>
          )}
          {group.resolved_at ? (
            <p>Resolved {new Date(group.resolved_at).toLocaleString()}</p>
          ) : (
            <button disabled={busy} onClick={() => void resolve(group)}>
              Mark resolved
            </button>
          )}
        </article>
      ))}
      <p>
        Request bodies, exception messages, photographs and locations are never
        collected. Provider logs remain available if monitoring storage is
        unavailable.
      </p>
    </div>
  );
}
