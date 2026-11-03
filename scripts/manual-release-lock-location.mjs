/** Host-wide Linux state: callers cannot select it through requests or environment. */
export function manualReleaseLockDirectory() {
  return '/var/tmp/turnright-manual-release-locks';
}
