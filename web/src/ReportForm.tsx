import { requestedCampus } from './campus-context';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { discardReportDraft, getPreference, setPreference } from './offline';
import type { Place, Position, ReportDraft } from './types';
export function ReportForm({
  place,
  coordinates,
  onDone,
  onDraftSaved,
}: {
  place?: Place | null;
  coordinates?: Position;
  onDone: () => void;
  onDraftSaved: () => void;
}) {
  const [category, setCategory] = useState('incorrect-place'),
    [description, setDescription] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [website, setWebsite] = useState('');
  const draftKey = `report:${place?.id || coordinates?.join(',') || 'general'}`;
  useEffect(() => {
    getPreference(draftKey, {
      description: '',
      category: 'incorrect-place',
    }).then((d) => {
      setDescription(d.description);
      setCategory(d.category);
    });
  }, [draftKey]);
  const submit = async () => {
    const point = place?.coordinates || coordinates;
    if (!point) {
      setError('Choose a place or a map pin first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campus: requestedCampus(),
          coordinates: point,
          placeId: place?.id,
          category,
          description,
          website,
        }),
      });
      const result = await response.json().catch(() => ({
        error:
          'Report submission needs the Vercel and Supabase setup. You can save a draft on this device.',
      }));
      if (!response.ok || result.error)
        throw new Error(result.error || 'Could not submit report');
      await discardReportDraft(draftKey).catch(() => {});
      onDraftSaved();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-content">
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000 }}>
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      <p>
        Tell us what needs correcting at{' '}
        <strong>{place?.name || 'this map pin'}</strong>. Reports are private
        and reviewed before the map changes.
      </p>
      <label className="field-label">
        What’s wrong?
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="incorrect-place">Incorrect place details</option>
          <option value="blocked-path">Blocked or closed path</option>
          <option value="missing-path">Missing path or entrance</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label className="field-label">
        Description
        <textarea
          minLength={10}
          maxLength={1000}
          rows={5}
          placeholder="Describe the place, path, or entrance that needs attention…"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <p className="small-note">
        No account or contact details needed. Please don’t include anyone’s
        personal information.
      </p>
      <div className="button-row">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await setPreference(draftKey, { description, category });
              const drafts = await getPreference<ReportDraft[]>(
                'report-drafts',
                [],
              );
              await setPreference(
                'report-drafts',
                [
                  {
                    key: draftKey,
                    placeId: place?.id,
                    coordinates: place?.coordinates || coordinates,
                    name: place?.name || 'Map pin',
                  },
                  ...drafts.filter((d) => d.key !== draftKey),
                ].slice(0, 30),
              );
              setSaved(true);
              onDraftSaved();
            } catch {
              setError(
                'This browser could not save the draft. Keep this page open and retry.',
              );
            }
          }}
        >
          {saved ? 'Draft saved' : 'Save draft'}
        </Button>
        <Button
          disabled={busy || description.trim().length < 10 || !navigator.onLine}
          onClick={submit}
        >
          {busy ? 'Submitting…' : 'Submit report'}
        </Button>
      </div>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          try {
            await discardReportDraft(draftKey);
            onDraftSaved();
            onDone();
          } catch {
            setError('This browser could not delete the draft. Please retry.');
          }
        }}
      >
        Discard draft
      </Button>
      {!navigator.onLine && (
        <p className="notice">
          You’re offline. Save a draft and submit it when connected.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
