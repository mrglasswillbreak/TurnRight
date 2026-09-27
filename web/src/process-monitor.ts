export type ProcessState =
  | 'running'
  | 'waiting'
  | 'complete'
  | 'failed'
  | 'cancelled';
export interface ProcessRecord {
  id: string;
  title: string;
  stage: string;
  state: ProcessState;
  started: number;
  updated: number;
  finished?: number;
  completed?: number;
  total?: number;
  unit?: string;
  cancel?: () => void;
  retry?: () => void;
}
export class ProcessMonitor {
  private records: ProcessRecord[] = [];
  private listeners = new Set<() => void>();
  private dismissed = new Map<string, string>();
  private epoch = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.records;
  set(
    record: Pick<ProcessRecord, 'id' | 'title' | 'stage' | 'state'> &
      Partial<ProcessRecord>,
  ) {
    const old = this.records.find((r) => r.id === record.id);
    const signature = `${record.state}:${record.stage}`;
    if (this.dismissed.get(record.id) === signature) return;
    this.dismissed.delete(record.id);
    const terminal = ['complete', 'failed', 'cancelled'].includes(record.state);
    if (
      old &&
      Object.entries(record).every(
        ([k, v]) => old[k as keyof ProcessRecord] === v,
      )
    )
      return;
    const next = {
      started: Date.now(),
      ...old,
      ...record,
      updated: Date.now(),
      finished: terminal ? old?.finished || Date.now() : undefined,
    };
    this.records = [...this.records.filter((r) => r.id !== record.id), next];
    const finished = this.records
      .filter((r) => r.finished)
      .sort((a, b) => b.updated - a.updated);
    this.records = this.records.filter(
      (r) => !r.finished || finished.indexOf(r) < 30,
    );
    this.listeners.forEach((fn) => fn());
  }
  remove = (id: string) => {
    const record = this.records.find((r) => r.id === id);
    if (record) this.dismissed.set(id, `${record.state}:${record.stage}`);
    this.records = this.records.filter((r) => r.id !== id);
    this.listeners.forEach((fn) => fn());
  };
  clear = () => {
    this.epoch++;
    this.dismissed.clear();
    this.records = [];
    this.listeners.forEach((fn) => fn());
  };
  begin(title: string, stage: string, cancel?: () => void) {
    const id = crypto.randomUUID();
    const epoch = this.epoch;
    const set = (record: Parameters<ProcessMonitor['set']>[0]) => {
      if (epoch === this.epoch) this.set(record);
    };
    this.set({ id, title, stage, state: 'running', cancel });
    return {
      update: (
        stage: string,
        completed?: number,
        total?: number,
        unit?: string,
      ) =>
        set({
          id,
          title,
          stage,
          state: 'running',
          completed,
          total,
          unit,
          cancel,
        }),
      finish: (stage = 'Complete') =>
        set({ id, title, stage, state: 'complete', cancel: undefined }),
      fail: (error: unknown) =>
        set({
          id,
          title,
          stage: error instanceof Error ? error.message : String(error),
          state:
            error instanceof Error && error.name === 'AbortError'
              ? 'cancelled'
              : 'failed',
          cancel: undefined,
        }),
    };
  }
}
export const processes = new ProcessMonitor();
export function processFraction(
  record: Pick<ProcessRecord, 'completed' | 'total'>,
) {
  return Number.isFinite(record.completed) &&
    Number.isFinite(record.total) &&
    record.total! > 0
    ? Math.min(1, Math.max(0, record.completed! / record.total!))
    : undefined;
}
