export type DiagnosticEvent =
  | 'admin-request-failed'
  | 'request-completed'
  | 'worker-completed'
  | 'worker-failed';
export interface DiagnosticContext {
  startedAt?: number;
  status?: number;
  requestId?: string;
  action?: string;
  dependency?: string;
  upstreamStatus?: number;
  worker?: string;
}
export function eventRecord(
  event: DiagnosticEvent,
  context?: DiagnosticContext,
  now?: number,
): Record<string, string | number>;
export function emitEvent(
  event: DiagnosticEvent,
  context?: DiagnosticContext,
): void;
