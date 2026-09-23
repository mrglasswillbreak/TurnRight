import { useState } from 'react';
import { api, supabase } from './supabase';
import {
  buildingPhotos,
  photoLicenses,
  placeBuildingId,
  validPhoto,
} from './arrival';
import type { ArrivalGuide, CampusData, CampusPhoto, MapEdit } from './types';

export function ArrivalEditor({
  edit,
  data,
  onProperty,
}: {
  edit: MapEdit;
  data: CampusData;
  onProperty: (key: string, value: unknown) => void;
}) {
  const [upload, setUpload] = useState<{
    id: string;
    previewUrl: string;
    metadata: Partial<CampusPhoto>;
    replaces?: string;
  }>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [privateUploads, setPrivateUploads] =
    useState<{ id: string; status: string; caption: string }[]>();
  if (!['place', 'entrance', 'building'].includes(edit.kind)) return null;
  const guide = (edit.properties.arrival || {}) as ArrivalGuide;
  const place = data.places.find((p) => p.id === edit.id);
  const buildingId =
    edit.kind === 'building'
      ? edit.id
      : String(
          edit.properties.buildingId ||
            (edit.kind === 'place'
              ? (place && placeBuildingId(data, place)) || ''
              : data.places.find((p) => p.id === edit.properties.placeId)
                  ?.buildingId || ''),
        );
  const photos =
    (edit.properties.photos as CampusPhoto[] | undefined) ??
    buildingPhotos(
      data,
      buildingId,
      edit.kind === 'entrance' ? edit.id : undefined,
    );
  const evidence = Object.values(guide.evidence || {}).flat()[0];
  const changeGuide = (key: keyof ArrivalGuide, value: unknown) => {
    const next = { ...guide, [key]: value };
    onProperty('arrival', next);
  };
  const applyEvidence = (source: string, checked: string) => {
    const ref = {
      sourceId: source,
      recordId: `arrival:${edit.id}`,
      checkedAt: checked,
    };
    onProperty('arrival', {
      ...guide,
      observedAt: checked,
      evidence: Object.fromEntries(
        [
          'description',
          'restrictions',
          'steps',
          'ramp',
          'surface',
          'doorwayWidthCm',
        ].map((key) => [key, [ref]]),
      ),
    });
  };
  const processUpload = async (id: string, replaces?: string) => {
    const result = await api<{
      metadata: Partial<CampusPhoto>;
      previewUrl: string;
    }>('media-process', { id });
    setUpload({
      id,
      replaces,
      previewUrl: result.previewUrl,
      metadata: {
        buildingId,
        entranceId: edit.kind === 'entrance' ? edit.id : undefined,
        checkedAt: new Date().toISOString().slice(0, 10),
        modifications:
          'Resized, oriented and converted to WebP; source metadata removed.',
        ...result.metadata,
      },
    });
    setReviewed(false);
  };
  const pick = async (file?: File) => {
    if (!file || !supabase) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{
        id: string;
        bucket: string;
        path: string;
        token: string;
      }>('media-begin', { bytes: file.size, mime: file.type });
      const uploaded = await supabase.storage
        .from(result.bucket)
        .uploadToSignedUrl(result.path, result.token, file, {
          contentType: file.type,
        });
      if (uploaded.error) throw uploaded.error;
      await processUpload(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!upload) return;
    setBusy(true);
    setError('');
    try {
      if (!reviewed || !validPhoto(upload.metadata))
        throw new Error(
          'Complete the caption, alternative text, author, source, license and building match, then confirm review.',
        );
      const photo = upload.id.startsWith('published:')
        ? upload.metadata
        : await api<CampusPhoto>('media-approve', {
            id: upload.id,
            metadata: upload.metadata,
            reviewed,
          });
      onProperty('photos', [
        ...photos.filter((p) => p.id !== upload.replaces && p.id !== photo.id),
        photo,
      ]);
      setUpload(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const photoField = (label: string, key: keyof CampusPhoto, type = 'text') => (
    <label className="field-label">
      {label}
      <input
        type={type}
        value={String(upload?.metadata[key] || '')}
        onChange={(e) => {
          setReviewed(false);
          setUpload(
            (v) =>
              v && {
                ...v,
                metadata: { ...v.metadata, [key]: e.target.value || undefined },
              },
          );
        }}
      />
    </label>
  );
  return (
    <section className="arrival-editor">
      {edit.kind !== 'building' && (
        <details>
          <summary>Entrance & arrival observations</summary>
          {(['description', 'restrictions', 'surface'] as const).map((key) => (
            <label className="field-label" key={key}>
              {key === 'description'
                ? 'Approach instructions'
                : key === 'restrictions'
                  ? 'Recorded restrictions'
                  : 'Recorded surface'}
              <textarea
                value={guide[key] || ''}
                onChange={(e) => changeGuide(key, e.target.value || undefined)}
              />
            </label>
          ))}
          <label className="field-label">
            Recorded steps (blank = unknown)
            <input
              type="number"
              min="0"
              value={guide.steps ?? ''}
              onChange={(e) =>
                changeGuide(
                  'steps',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="field-label">
            Ramp
            <select
              value={guide.ramp || 'unknown'}
              onChange={(e) => changeGuide('ramp', e.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Recorded present</option>
              <option value="no">Recorded absent</option>
            </select>
          </label>
          <label className="field-label">
            Measured doorway width (cm)
            <input
              type="number"
              min="1"
              value={guide.doorwayWidthCm ?? ''}
              onChange={(e) =>
                changeGuide(
                  'doorwayWidthCm',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="field-label">
            Public evidence description
            <input
              value={evidence?.sourceId || ''}
              onChange={(e) =>
                applyEvidence(e.target.value, guide.observedAt || '')
              }
              placeholder="Owner observation, campus notice…"
            />
          </label>
          <label className="field-label">
            Observation date
            <input
              type="date"
              value={guide.observedAt?.slice(0, 10) || ''}
              onChange={(e) =>
                applyEvidence(evidence?.sourceId || '', e.target.value)
              }
            />
          </label>
          {guide.needsReview && (
            <label>
              <input
                type="checkbox"
                checked={false}
                onChange={() => changeGuide('needsReview', false)}
              />{' '}
              I reviewed instructions and photos after this entrance moved.
            </label>
          )}
          <p className="small-note">
            Record only observed facts. These fields never grant access or
            create an accessible route.
          </p>
        </details>
      )}
      {['building', 'entrance'].includes(edit.kind) && (
        <details>
          <summary>Photographs · {photos.length}</summary>
          <p className="small-note">
            Originals stay private. Every attached, approved derivative is
            included offline after preview and publication.
          </p>
          {photos.map((photo, i) => (
            <div key={photo.id}>
              <p>
                {photo.caption} · {photo.license}
                {photo.historical ? ' · historical' : ''}
              </p>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const next = [...photos];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onProperty('photos', next);
                }}
              >
                Move earlier
              </button>
              <button
                type="button"
                onClick={() =>
                  onProperty(
                    'photos',
                    photos.filter((p) => p.id !== photo.id),
                  )
                }
              >
                Remove from draft
              </button>
              {
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      if (!photo.id.startsWith('owner:')) {
                        setUpload({
                          id: `published:${photo.id}`,
                          previewUrl: photo.url,
                          metadata: { ...photo },
                          replaces: photo.id,
                        });
                        setReviewed(false);
                        return;
                      }
                      const result = await api<{ id: string }>('media-revise', {
                        id: photo.id.slice(6),
                      });
                      await processUpload(result.id, photo.id);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revise caption or match
                </button>
              }
            </div>
          ))}
          <label className="field-label">
            Import / upload photograph (JPEG, PNG, WebP; up to 10 MiB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || !buildingId}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                setPrivateUploads(await api('media-list', {}));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Recover private uploads
          </button>
          {privateUploads && (
            <div>
              <p className="small-note">
                Your latest 100 private uploads. Resume review or attach an
                approved photograph; nothing publishes automatically.
              </p>
              {!privateUploads.length && <p>No private uploads found.</p>}
              {privateUploads.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy || !buildingId}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await processUpload(item.id);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {item.caption} · {item.status} · {item.id.slice(0, 8)}
                </button>
              ))}
            </div>
          )}
          {!buildingId && (
            <p className="notice">
              Link this entrance to its building before adding photographs.
            </p>
          )}
          {upload && (
            <div>
              <img
                src={upload.previewUrl}
                alt="Private optimized photograph awaiting owner review"
                style={{ width: '100%', height: 'auto' }}
              />
              <p className="small-note">
                Matched building: {buildingId}
                {edit.kind === 'entrance'
                  ? ` · entrance ${edit.id}`
                  : ' · general building photograph'}
              </p>
              {photoField('Caption', 'caption')}
              {photoField('Alternative text', 'alt')}
              {photoField('Photographer / author', 'author')}
              {photoField('Original source page', 'sourceUrl', 'url')}
              <label className="field-label">
                Verified redistribution license
                <select
                  value={upload.metadata.license || ''}
                  onChange={(e) => {
                    setReviewed(false);
                    setUpload({
                      ...upload,
                      metadata: {
                        ...upload.metadata,
                        license: e.target.value as CampusPhoto['license'],
                      },
                    });
                  }}
                >
                  <option value="">Choose verified license</option>
                  {photoLicenses.map((license) => (
                    <option key={license}>{license}</option>
                  ))}
                </select>
              </label>
              {photoField(
                'License / permission notice URL',
                'licenseUrl',
                'url',
              )}
              {photoField('Required attribution', 'attribution')}
              {photoField('Capture date (if known)', 'capturedAt', 'date')}
              {photoField('Source checked', 'checkedAt', 'date')}
              <label>
                <input
                  type="checkbox"
                  checked={!!upload.metadata.historical}
                  onChange={(e) =>
                    setUpload({
                      ...upload,
                      metadata: {
                        ...upload.metadata,
                        historical: e.target.checked,
                      },
                    })
                  }
                />{' '}
                Historical view
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{' '}
                I checked visual quality, building / entrance identity, original
                author and permission for offline redistribution.
              </label>
              <button
                type="button"
                disabled={busy || !reviewed}
                onClick={() => void approve()}
              >
                Approve photograph and attach to draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setUpload(undefined)}
              >
                Keep private; cancel attachment
              </button>
            </div>
          )}
          {busy && <output>Processing photograph…</output>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </details>
      )}
    </section>
  );
}
