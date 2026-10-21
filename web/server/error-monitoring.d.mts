export function monitoringEnvelope(
  record: Record<string, unknown>,
  environment?: Record<string, string | undefined>,
): Record<string, string | number> | undefined;
export function monitoringConfiguration(
  environment?: Record<string, string | undefined>,
): { origin: string; key: string } | undefined;
export function captureOperationalError(record: Record<string, unknown>): void;
export function flushErrorMonitoring(): Promise<void>;
