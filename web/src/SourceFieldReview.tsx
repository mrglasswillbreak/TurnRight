import { useState } from 'react';
import type { CampusData, MapChange, Place } from './types';
import type { SourceRecord } from './editor-model';
import { selectableSourceFields } from './source-field-review';
import { safeWebsite } from './place-details';
import { findDuplicateCandidates } from './duplicates';
import { Button } from '@/components/ui/button';

export function SourceFieldReview({
  change,
  data,
  busy,
  action,
}: {
  change: MapChange;
  data: CampusData;
  busy: boolean;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const fields = selectableSourceFields(change);
  const record = change.after as SourceRecord | null;
  const properties =
    record?.entity === 'feature' ? record.payload.properties : record?.payload;
  const refs = Object.values(properties?.evidence || {}).flat() as {
    sourceId: string;
    recordId: string;
    url?: string;
    checkedAt: string;
  }[];
  const duplicates =
    record?.entity === 'place'
      ? findDuplicateCandidates({
          ...data,
          places: [
            ...data.places.filter((p) => p.id !== record.payload.id),
            record.payload as Place,
          ],
        }).filter((d) => d.ids.includes(record.payload.id))
      : [];
  return (
    <div className="source-field-review">
      {change.kind === 'remove' && (
        <p className="notice">
          Absent from this source snapshot. This does not establish closure or
          demolition. Check evidence before accepting removal.
        </p>
      )}
      {!!duplicates.length && (
        <p className="notice">
          Possible duplicates:{' '}
          {duplicates.map((d) => d.names.join(' / ')).join('; ')}. Review
          identity; sharing a building does not make two businesses the same
          place.
        </p>
      )}
      {!!refs.length && (
        <details>
          <summary>Source evidence</summary>
          <ul>
            {refs.map((ref, i) => (
              <li key={i}>
                {ref.sourceId} · {ref.recordId} · checked {ref.checkedAt}
                {safeWebsite(ref.url) && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={safeWebsite(ref.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!fields.length && (
        <fieldset>
          <legend>Accept supported details separately</legend>
          {fields.map((field) => (
            <label key={field}>
              <input
                type="checkbox"
                checked={selected.includes(field)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, field]
                      : s.filter((v) => v !== field),
                  )
                }
              />{' '}
              {field}
            </label>
          ))}
          <p className="small-note">
            Geometry, connections and unselected fields remain pending.
          </p>
          <Button
            variant="outline"
            disabled={busy || !selected.length}
            onClick={async () => {
              if (
                await action(
                  'review-change',
                  { id: change.id, accept: true, fields: selected },
                  'Selected details accepted. Remaining differences still await review.',
                )
              )
                setSelected([]);
            }}
          >
            Accept selected details
          </Button>
        </fieldset>
      )}
    </div>
  );
}
