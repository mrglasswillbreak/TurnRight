import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import App from './App';
import { ApplicationRecovery } from './ApplicationRecovery';
import { restorePublicCampus } from './campus-context';
restorePublicCampus();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationRecovery>
      <App />
    </ApplicationRecovery>
  </StrictMode>,
);
