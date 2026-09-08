import type { CampusData } from './types';
import { supabase } from './supabase';
import { Button } from '@/components/ui/button';
export default function Admin({ data }: { data: CampusData }) { return <main className="loading-screen"><h1>TurnRight map editor</h1><p>{supabase ? 'Sign in with the configured administrator account to review campus changes.' : 'Connect Supabase to enable the protected editor. See the deployment guide in the repository.'}</p>{supabase && <Button onClick={() => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + '/admin' } })}>Sign in with GitHub</Button>}<p>{data.places.length} campus places loaded.</p><a className="text-button" href="/">Back to campus map</a></main>; }
