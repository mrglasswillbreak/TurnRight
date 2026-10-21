import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import App from './App';
import { ApplicationRecovery } from './ApplicationRecovery';
import { restorePublicCampus } from './campus-context';
import { installGlobalDiagnostics } from './diagnostics';
const removeDiagnostics = installGlobalDiagnostics();
if (import.meta.hot) import.meta.hot.dispose(removeDiagnostics);
restorePublicCampus();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationRecovery>
      <App />
    </ApplicationRecovery>
  </StrictMode>,
);
