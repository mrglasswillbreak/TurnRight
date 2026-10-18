import { useState } from 'react';
import { supabase } from './supabase';

/** Loaded only by the development server; production uses campus GitHub sign-in. */
export default function LocalSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async event => {
      event.preventDefault();
      if (!supabase || busy) return;
      setBusy(true);
      setError('');
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) setError('Local sign-in failed. Check the credentials in .local-runtime/accounts.json.');
      } catch { setError('The local authentication service is unavailable.'); }
      finally { setBusy(false); }
    }}>
      <p>Local development accounts use the same session and campus permission checks as hosted accounts.</p>
      <label>Email <input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label>Password <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in locally'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
