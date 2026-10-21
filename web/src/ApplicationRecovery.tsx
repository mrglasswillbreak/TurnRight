import { Component, type ReactNode } from 'react';
import { recordDiagnostic, downloadDiagnostics } from './diagnostics';

export class ApplicationRecovery extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    recordDiagnostic('render-failed');
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="startup-screen" role="alert">
        <h1>TurnRight could not finish opening this view</h1>
        <p>
          Reload to recover. Downloaded maps and saved drafts remain on this
          device.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload TurnRight
        </button>
        <button type="button" onClick={downloadDiagnostics}>
          Download diagnostic report
        </button>
      </main>
    );
  }
}
