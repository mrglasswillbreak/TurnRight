import { describe, it, expect, vi } from 'vitest';
import { ProcessMonitor, processFraction } from '../src/process-monitor';
describe('process monitor', () => {
  it('notifies once for a batch and does not rerender unchanged statuses', () => {
    const monitor = new ProcessMonitor(),
      listener = vi.fn();
    monitor.subscribe(listener);
    const update = () => {
      for (let i = 0; i < 30; i++)
        monitor.set({
          id: String(i),
          title: 'Import',
          stage: 'Reading',
          state: 'running',
        });
    };
    monitor.batch(update);
    expect(listener).toHaveBeenCalledTimes(1);
    monitor.batch(update);
    monitor.remove('missing');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() =>
      monitor.batch(() => {
        monitor.remove('0');
        throw Error('failure');
      }),
    ).toThrow('failure');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(monitor.snapshot()).toHaveLength(29);
  });
  it('uses the recorded server completion time for historical jobs', () => {
    const m = new ProcessMonitor();
    m.set({
      id: 'historic',
      title: 'Import',
      stage: 'Done',
      state: 'complete',
      started: 1000,
      finished: 2000,
    });
    expect(m.snapshot()[0].finished).toBe(2000);
  });
  it('reports measured progress only and never fabricates a percent', () => {
    expect(processFraction({})).toBeUndefined();
    expect(processFraction({ completed: 1, total: 0 })).toBeUndefined();
    expect(processFraction({ completed: 3, total: 5 })).toBe(0.6);
    expect(processFraction({ completed: 8, total: 5 })).toBe(1);
  });
  it('keeps dismissals until a stage changes and isolates owner sessions', () => {
    const m = new ProcessMonitor();
    m.set({ id: 'a', title: 'Import', stage: 'Ready', state: 'complete' });
    m.remove('a');
    m.set({ id: 'a', title: 'Import', stage: 'Ready', state: 'complete' });
    expect(m.snapshot()).toHaveLength(0);
    m.set({ id: 'a', title: 'Import', stage: 'Retry', state: 'running' });
    expect(m.snapshot()).toHaveLength(1);
    const task = m.begin('Private image', 'Reading');
    m.clear();
    task.finish();
    expect(m.snapshot()).toHaveLength(0);
  });
  it('retains active jobs while bounding finished history and marking cancellation', () => {
    const m = new ProcessMonitor();
    const active = m.begin('Build', 'Rendering');
    for (let i = 0; i < 40; i++) m.begin('Old', 'Work').finish();
    expect(m.snapshot().filter((r) => r.finished)).toHaveLength(30);
    expect(m.snapshot().some((r) => r.title === 'Build')).toBe(true);
    active.fail(new DOMException('Cancelled', 'AbortError'));
    expect(m.snapshot().find((r) => r.title === 'Build')?.state).toBe(
      'cancelled',
    );
  });
});
