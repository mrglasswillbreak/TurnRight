import { useState } from 'react';
import { api } from './supabase';
import { Button } from '@/components/ui/button';

interface Check {
  id: string;
  source_key: string;
  status: string;
  evidence_retention?: { rawSnapshot?: string };
  receipt: {
    url?: string;
    retrievedAt: string;
    contentHash: string;
    importerVersion: string;
    collections: Array<{
      identity: string;
      complete: boolean;
      count: number | null;
    }>;
  };
  diagnostics: Array<{ message?: string; classification: string }>;
}
interface Decision {
  id: string;
  group_id: string;
  outcome: string;
  actor: string;
  created_at: string;
  dependency_count: number;
  evidence: unknown;
}
interface Undo {
  decisionId: string;
  eligible: boolean;
  blockingReasons: string[];
  dependencyCount: number;
  affected: Array<{ id: string; kind: string }>;
}
export default function SourceRecovery({
  canEdit,
  onRefresh,
}: {
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [findings, setFindings] = useState<
    Array<{ id: string; finding: string }>
  >([]);
  const [undo, setUndo] = useState<Undo & { reversalId: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [provenance, setProvenance] = useState<{
    checkId: string;
    findings: Array<{ identity: string; recoverable: boolean; reason: string }>;
    nextOffset: number | null;
  }>();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const [history, receipt] = await Promise.all([
      api<{ checks: Check[] }>('source-updates-check-detail', {}),
      api<{
        decisions: Decision[];
        legacyFindings: Array<{ id: string; finding: string }>;
      }>('source-updates-decisions', {}),
    ]);
    setChecks(history.checks);
    setDecisions(receipt.decisions);
    setFindings(receipt.legacyFindings);
    setLoaded(true);
  }
  return (
    <section
      aria-label="Source checks and recovery"
      className="source-recovery"
    >
      <h3>Check evidence and recovery</h3>
      <p>
        Inspect download evidence and accepted decisions. Undo affects the
        private workspace; changing the public map requires a separate
        publication.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void run(load)}>
        {loaded ? 'Refresh evidence' : 'Load check history'}
      </Button>
      {message && <output>{message}</output>}
      {checks.map((check) => (
        <details key={check.id}>
          <summary>
            {check.source_key} ·{' '}
            {check.status === 'shadow'
              ? 'Comparison only — rollout verification'
              : check.status}{' '}
            · {new Date(check.receipt.retrievedAt).toLocaleString()}
          </summary>
          <p>
            Originally retrieved{' '}
            {new Date(check.receipt.retrievedAt).toLocaleString()}. Cached
            checks retain this time.
          </p>
          {check.evidence_retention?.rawSnapshot === 'expired' && (
            <p>
              This older check retains its receipt and decision evidence. Its
              temporary raw snapshot has expired to save space. Verify again to
              inspect fresh legacy provenance.
            </p>
          )}
          {check.receipt.url?.startsWith('https://') && (
            <a href={check.receipt.url} target="_blank" rel="noreferrer">
              View source
            </a>
          )}
          <ul>
            {check.receipt.collections.map((c) => (
              <li key={c.identity}>
                {c.identity}: {c.count ?? 'Unknown count of'} source features ·{' '}
                {c.complete ? 'Complete' : 'Incomplete; changes held'}
              </li>
            ))}
          </ul>
          {check.diagnostics.map((d, i) => (
            <p key={i}>{d.message || d.classification.replaceAll('_', ' ')}</p>
          ))}
          <Button
            disabled={busy || !canEdit}
            onClick={() =>
              void run(async () => {
                await api('source-updates-reverify', { checkId: check.id });
                setMessage(
                  'A fresh check was requested. Existing decisions are retained.',
                );
              })
            }
          >
            Verify again
          </Button>
          <details>
            <summary>Download receipt</summary>
            <pre>{JSON.stringify(check.receipt, null, 2)}</pre>
          </details>
          <Button
            variant="outline"
            disabled={
              busy || check.evidence_retention?.rawSnapshot === 'expired'
            }
            onClick={() =>
              void run(async () => {
                const result = await api<{
                  findings: Array<{
                    identity: string;
                    recoverable: boolean;
                    reason: string;
                  }>;
                  nextOffset: number | null;
                }>('source-updates-provenance', { checkId: check.id });
                setProvenance({ checkId: check.id, ...result });
              })
            }
          >
            Inspect legacy provenance
          </Button>
        </details>
      ))}
      {provenance && (
        <details open>
          <summary>Legacy provenance findings</summary>
          <p>
            This audit does not change the map or establish an accepted
            baseline.
          </p>
          {provenance.findings.map((f) => (
            <p key={f.identity}>
              {f.identity}: {f.reason}
            </p>
          ))}
          {provenance.nextOffset !== null && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    findings: Array<{
                      identity: string;
                      recoverable: boolean;
                      reason: string;
                    }>;
                    nextOffset: number | null;
                  }>('source-updates-provenance', {
                    checkId: provenance.checkId,
                    offset: provenance.nextOffset,
                  });
                  setProvenance({ checkId: provenance.checkId, ...result });
                })
              }
            >
              Next provenance page
            </Button>
          )}
        </details>
      )}
      {decisions.map((decision) => (
        <details key={decision.id}>
          <summary>
            {decision.outcome} · {decision.dependency_count} dependent records ·{' '}
            {new Date(decision.created_at).toLocaleString()}
          </summary>
          <p>
            Actor: {decision.actor || 'Recorded worker'} · Decision:{' '}
            {decision.id}
          </p>
          {decision.outcome === 'accepted' && (
            <Button
              variant="outline"
              disabled={busy || !canEdit}
              onClick={() =>
                void run(async () => {
                  const preview = await api<Undo>(
                    'source-updates-undo-preview',
                    { decisionId: decision.id },
                  );
                  setUndo({ ...preview, reversalId: crypto.randomUUID() });
                })
              }
            >
              Preview undo
            </Button>
          )}
          <details>
            <summary>Decision evidence</summary>
            <pre>{JSON.stringify(decision.evidence, null, 2)}</pre>
          </details>
        </details>
      ))}
      {!!findings.length && (
        <div className="notice">
          <h4>Historical decisions to inspect</h4>
          <p>
            These findings do not change accepted or rejected decisions. Their
            evidence is insufficient for automatic reversal.
          </p>
          {findings.map((f) => (
            <p key={f.id}>
              {f.id}: {f.finding}
            </p>
          ))}
        </div>
      )}
      {undo && (
        <section aria-label="Undo preview" className="notice">
          <h4>Undo this source decision?</h4>
          <p>
            {undo.dependencyCount} dependent records will be checked again when
            you confirm. Later editor corrections remain in place.
          </p>
          <ul>
            {undo.affected.map((m) => (
              <li key={m.id}>
                {m.kind}: {m.id}
              </li>
            ))}
          </ul>
          {undo.blockingReasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <Button
            disabled={busy || !canEdit || !undo.eligible}
            onClick={() =>
              void run(async () => {
                await api('source-updates-undo-confirm', {
                  decisionId: undo.decisionId,
                  reversalId: undo.reversalId,
                });
                setUndo(undefined);
                const confirmed =
                  'Reversed in the private workspace. The public map has not changed.';
                setMessage(confirmed);
                try {
                  await onRefresh();
                  await load();
                } catch (error) {
                  setMessage(
                    `${confirmed} Refresh could not finish: ${(error as Error).message}. Refresh the workspace to see the updated records.`,
                  );
                }
              })
            }
          >
            Confirm private workspace undo
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setUndo(undefined)}
          >
            Cancel
          </Button>
        </section>
      )}
    </section>
  );
}
