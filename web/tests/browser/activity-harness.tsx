import { createRoot } from 'react-dom/client';
import ProcessMonitor from '../../src/ProcessMonitor';
import { processes } from '../../src/process-monitor';
import type { PhotoJob } from '../../src/photo-queue-store';
import '../../src/styles.css';
const listeners = new Set<() => void>();
const state = {
  jobs: [] as PhotoJob[],
  storageError: '',
  leader: true,
  paused: false,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getStatus: () =>
    `${state.jobs.filter((j) => j.state === 'uploading').length} uploading or queued · ${state.jobs.length} private drafts · ${state.storageError || 'Recovery saved'}${state.paused ? ' · Paused' : ''}${!state.leader ? ' · Active in another tab' : ''}`,
  togglePause: () => {
    state.paused = !state.paused;
    listeners.forEach((fn) => fn());
  },
};
function scenario(name: string) {
  processes.clear();
  state.paused = false;
  state.leader = name !== 'another';
  state.storageError =
    name === 'recovery'
      ? 'Photo recovery could not be saved. Keep this tab open.'
      : '';
  state.jobs =
    name === 'idle'
      ? []
      : Array.from(
          { length: name === 'drafts' ? 4 : 1 },
          (_, i) =>
            ({
              key: String(i),
              filename: 'Test photograph',
              state: ['active', 'another'].includes(name)
                ? 'uploading'
                : name === 'failed'
                  ? 'failed'
                  : 'ready',
            }) as PhotoJob,
        );
  for (const job of state.jobs)
    processes.set({
      id: `photo:${job.key}`,
      title: job.filename,
      stage: job.state,
      state:
        job.state === 'uploading'
          ? 'running'
          : job.state === 'failed'
            ? 'failed'
            : 'complete',
    });
  listeners.forEach((fn) => fn());
}
createRoot(document.getElementById('root')!).render(
  <>
    <main>
      <h1>Activity fixture</h1>
      {['idle', 'drafts', 'active', 'another', 'failed', 'recovery'].map(
        (name) => (
          <button key={name} onClick={() => scenario(name)}>
            {name}
          </button>
        ),
      )}
    </main>
    <ProcessMonitor photoStore={state} />
  </>,
);
