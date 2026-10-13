import { useState } from 'react';
import { api } from './supabase';
import { sourceFieldLabel, sourceKindLabel } from './source-updates';
import { Button } from '@/components/ui/button';
interface Dependencies {
  members: Array<{
    id: string;
    entity: string;
    kind: 'add' | 'modify' | 'remove';
    editorOverride: boolean;
    beforeHash: string | null;
    afterHash: string | null;
  }>;
  total: number;
  nextOffset: number | null;
  evidence: unknown;
}
export default function SourceGroupDetails({ id }: { id: string }) {
  const [data, setData] = useState<Dependencies>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(offset = 0) {
    setBusy(true);
    setError('');
    try {
      setData(
        await api<Dependencies>('source-updates-group-detail', { id, offset }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Dependent source records" className="source-recovery">
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Inspect dependent records
      </Button>
      {error && <output>{error}</output>}
      {data && (
        <>
          <p>
            {data.total} records belong to this decision. The complete group is
            checked and applied together.
          </p>
          <ul>
            {data.members.map((m) => (
              <li key={m.id}>
                {sourceKindLabel[m.kind]} · {sourceFieldLabel(m.entity)} ·{' '}
                {m.id}
                {m.editorOverride && (
                  <strong> · Saved editor correction retained</strong>
                )}
              </li>
            ))}
          </ul>
          {data.nextOffset !== null && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void load(data.nextOffset!)}
            >
              Next dependency page
            </Button>
          )}
          <details>
            <summary>Verification evidence</summary>
            <pre>{JSON.stringify(data.evidence, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
