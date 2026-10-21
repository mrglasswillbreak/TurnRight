/** Volatile, bounded support evidence. Never accept Error objects or user payloads. */
type DiagnosticEvent =
  | 'render-failed'
  | 'unhandled-error'
  | 'unhandled-rejection'
  | 'admin-request-failed';
type FailureReason = 'network' | 'timeout' | 'auth' | 'server' | 'response';
export interface DiagnosticContext {
  status?: number;
  reason?: FailureReason;
  requestId?: string;
}
interface DiagnosticRecord extends DiagnosticContext {
  event: DiagnosticEvent;
  timestamp: string;
  occurrences: number;
}
const events = new Set<DiagnosticEvent>([
  'render-failed',
  'unhandled-error',
  'unhandled-rejection',
  'admin-request-failed',
]);
const reasons = new Set<FailureReason>([
  'network',
  'timeout',
  'auth',
  'server',
  'response',
]);
const records: DiagnosticRecord[] = [];
const limit = 50;

export function diagnosticRequestId(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|ref-\d{1,12})$/i.test(
      value,
    )
    ? value
    : undefined;
}

export function recordDiagnostic(
  event: DiagnosticEvent,
  context: DiagnosticContext = {},
  now = Date.now(),
) {
  if (!events.has(event) || !Number.isFinite(now) || Math.abs(now) > 8.64e15)
    return;
  const record: DiagnosticRecord = {
    event,
    timestamp: new Date(now).toISOString(),
    occurrences: 1,
  };
  if (
    Number.isInteger(context.status) &&
    context.status! >= 100 &&
    context.status! <= 599
  )
    record.status = context.status;
  if (context.reason && reasons.has(context.reason))
    record.reason = context.reason;
  const requestId = diagnosticRequestId(context.requestId);
  if (requestId) record.requestId = requestId;
  const previous = records.at(-1);
  if (
    previous &&
    previous.event === event &&
    previous.status === record.status &&
    previous.reason === record.reason &&
    previous.requestId === record.requestId &&
    now >= Date.parse(previous.timestamp) &&
    now - Date.parse(previous.timestamp) < 5000
  ) {
    previous.occurrences = Math.min(previous.occurrences + 1, 9999);
    return;
  }
  records.push(record);
  if (records.length > limit) records.shift();
}

/** Export is explicit; the application never transmits this buffer. */
export function diagnosticReport() {
  return JSON.stringify(
    { schemaVersion: 1, events: records.map((record) => ({ ...record })) },
    null,
    2,
  );
}

export function clearDiagnostics() {
  records.length = 0;
}

export function installGlobalDiagnostics(target: Window = window) {
  const error = () => recordDiagnostic('unhandled-error');
  const rejection = () => recordDiagnostic('unhandled-rejection');
  target.addEventListener('error', error);
  target.addEventListener('unhandledrejection', rejection);
  return () => {
    target.removeEventListener('error', error);
    target.removeEventListener('unhandledrejection', rejection);
  };
}

export function downloadDiagnostics() {
  const url = URL.createObjectURL(
    new Blob([diagnosticReport()], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'turnright-diagnostics.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
