import { useEffect, useState, useSyncExternalStore } from 'react';
import { Activity, Check, X } from 'lucide-react';
import {
  processes,
  processFraction,
  type ProcessRecord,
} from './process-monitor';
import { api } from './supabase';
import type { CampusImport } from './map-import-types';
import type { ReviewState } from './EditorReview';
import './process-monitor.css';

export function ProcessProgress({ record }: { record: ProcessRecord }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (record.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [record.finished]);
  const fraction = processFraction(record);
  const elapsed = Math.max(
    0,
    Math.floor(((record.finished || now) - record.started) / 1000),
  );
  return (
    <article className="process-card" data-state={record.state}>
      <strong>{record.title}</strong>
      <span>{record.stage}</span>
      {record.state === 'running' && (
        <progress
          aria-label={`${record.title} progress`}
          max={1}
          value={fraction}
        />
      )}
      <small>
        {record.state}
        {record.elapsedKnown !== false
          ? ` · ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
          : ''}
        {fraction !== undefined
          ? ` · ${record.completed} / ${record.total} ${record.unit || ''}`
          : ''}
      </small>
      <div>
        {record.cancel && <button onClick={record.cancel}>Cancel</button>}
        {record.retry && <button onClick={record.retry}>Retry</button>}
        {record.finished && (
          <button
            aria-label={`Dismiss ${record.title}`}
            onClick={() => processes.remove(record.id)}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </article>
  );
}
export default function ProcessMonitor() {
  const records = useSyncExternalStore(processes.subscribe, processes.snapshot);
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let stopped = false,
      polling = false,
      lastPoll = 0,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      lastPoll = Date.now();
      if (!document.hidden && navigator.onLine) {
        const watching = processes.snapshot().filter((p) => !p.finished);
        const watched = (prefix: string) =>
          watching
            .filter((p) => p.id.startsWith(`${prefix}:`))
            .map((p) => p.id.slice(prefix.length + 1))
            .filter((id) => /^[a-f0-9-]{36}$/i.test(id));
        const results = await Promise.allSettled([
          api<
            Pick<ReviewState, 'jobs' | 'releases'> & { imports: CampusImport[] }
          >(
            'process-status',
            {
              watch: {
                jobs: watched('job'),
                releases: watched('release'),
                imports: watched('import'),
              },
            },
            { signal: controller.signal },
          ),
        ]);
        if (stopped) return;
        setError(
          results.some((r) => r.status === 'rejected')
            ? 'Background status could not refresh. Retrying while online; last known stages are shown.'
            : '',
        );
        processes.batch(() => {
          if (results[0].status === 'fulfilled') {
            for (const j of results[0].value.jobs || [])
              processes.set({
                id: `job:${j.id}`,
                title: j.kind.startsWith('release:')
                  ? `Release ${j.kind.endsWith(':publish') ? 'publication' : 'build'}`
                  : j.kind.replaceAll('-', ' '),
                stage: j.message || j.status,
                started: Date.parse(j.created_at),
                finished: j.completed_at
                  ? Date.parse(j.completed_at)
                  : undefined,
                elapsedKnown:
                  !!j.completed_at || /running|queue|pending/.test(j.status),
                state: /fail|error/.test(j.status)
                  ? 'failed'
                  : /complete|succeed|success|done/.test(j.status)
                    ? 'complete'
                    : /cancel/.test(j.status)
                      ? 'cancelled'
                      : /queue|pending/.test(j.status)
                        ? 'waiting'
                        : 'running',
              });
            for (const r of results[0].value.releases || []) {
              if (
                results[0].value.jobs?.some((j) =>
                  j.kind.startsWith(`release:${r.id}:`),
                )
              ) {
                processes.remove(`release:${r.id}`);
                continue;
              }
              processes.set({
                id: `release:${r.id}`,
                title: `Release: ${r.summary}`,
                stage: r.error || r.status,
                started: Date.parse(r.created_at),
                elapsedKnown: !['failed', 'preview', 'published'].includes(
                  r.status,
                ),
                state:
                  r.status === 'failed'
                    ? 'failed'
                    : ['preview', 'published'].includes(r.status)
                      ? 'complete'
                      : r.status === 'queued'
                        ? 'waiting'
                        : 'running',
              });
            }
          }
          if (results[0].status === 'fulfilled')
            for (const j of results[0].value.imports || []) {
              if (j.status === 'draft') continue;
              processes.set({
                id: `import:${j.id}`,
                title: `Map import ${j.phase === 'inspect' ? 'inspection' : 'preview'} · ${j.id.slice(0, 6)}`,
                stage: j.message || j.status,
                started: Date.parse(j.created_at),
                finished: ['running', 'queued'].includes(j.status)
                  ? undefined
                  : Date.parse(j.updated_at),
                state:
                  j.status === 'running'
                    ? 'running'
                    : j.status === 'queued'
                      ? 'waiting'
                      : j.status === 'failed'
                        ? 'failed'
                        : j.status === 'cancelled'
                          ? 'cancelled'
                          : 'complete',
                cancel: ['running', 'queued'].includes(j.status)
                  ? processes.snapshot().find((p) => p.id === `import:${j.id}`)
                      ?.cancel ||
                    (() => {
                      void api('import-cancel', { importId: j.id }).catch((e) =>
                        setError(e.message),
                      );
                    })
                  : undefined,
              });
            }
        });
      }
      polling = false;
      if (!stopped)
        timer = setTimeout(
          poll,
          processes.snapshot().some((p) => !p.finished) ? 5000 : 30000,
        );
    };
    const wake = () => {
      if (stopped || polling || document.hidden || !navigator.onLine) return;
      clearTimeout(timer);
      timer = setTimeout(poll, Math.max(0, 5000 - (Date.now() - lastPoll)));
    };
    const unsubscribe = processes.subscribe(() => {
      if (processes.snapshot().some((p) => !p.finished)) wake();
    });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void poll();
    return () => {
      stopped = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      controller.abort();
      clearTimeout(timer);
      processes.clear();
    };
  }, []);
  const active = records.filter((r) => !r.finished).length;
  return (
    <aside className="process-monitor" aria-label="Activity monitor">
      <button
        className="process-launch"
        aria-expanded={open}
        aria-controls="process-list"
        onClick={() => setOpen(!open)}
      >
        <Activity size={18} />
        Activity{active ? ` · ${active}` : <Check size={15} />}
      </button>
      {open && (
        <section id="process-list" aria-label="Builds and processes">
          <header>
            <strong>Builds and processes</strong>
            <button aria-label="Close activity" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </header>
          {error && <output>{error}</output>}
          {!navigator.onLine && (
            <p>Offline — server stages resume updating when connected.</p>
          )}
          {!records.length && <p>No processes yet.</p>}
          {[...records]
            .sort(
              (a, b) =>
                Number(!!a.finished) - Number(!!b.finished) ||
                b.started - a.started,
            )
            .map((r) => (
              <ProcessProgress key={r.id} record={r} />
            ))}
        </section>
      )}
    </aside>
  );
}
