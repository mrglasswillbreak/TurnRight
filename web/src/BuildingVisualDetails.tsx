import type { Feature } from 'geojson';
import type { CampusData } from './types';
import { buildingDisplay } from './map-display';
import { buildingRevision, compatibleVisual } from './building-visuals';
export function BuildingVisualDetails({
  data,
  feature,
}: {
  data: CampusData;
  feature: Feature;
}) {
  const record = data.visuals?.buildings.find(
    (b) => b.id === feature.properties?.id,
  );
  const current = compatibleVisual(feature, record);
  const photoEvidence = feature.properties?.appearance
    ?.photoEvidence as import('./visual-types').BuildingAppearance['photoEvidence'];
  const photoIds = new Set(
    data.photos
      ?.filter((p) => p.buildingId === feature.properties?.id)
      .map((p) => p.id),
  );
  const correctionPending =
    record?.geometryReview?.baselineRevision === buildingRevision(feature);
  const needed = (record?.needed || []).filter(
    (item) =>
      !current ||
      !item.startsWith('Accept the separate-wing geometry correction'),
  );
  const description =
    current && record && record.heightKind !== 'illustrative'
      ? record.heightKind === 'recorded'
        ? `${record.height} m · recorded height`
        : `Approximately ${record.height} m · ${record.floors} ${record.heightKind === 'observed-floors' ? 'visually observed floors' : 'documented floors'} × 3 m`
      : buildingDisplay(feature.properties || {}).description;
  return (
    <div className="building-height-note">
      <span>{description}</span>
      {record && (
        <details className="building-evidence">
          <summary>
            {current
              ? `${record.level === 'extrusion' ? (record.heightKind === 'illustrative' ? 'Illustrative' : 'Source extrusion') : record.level === 'detailed' ? 'Detailed' : 'Simplified'} 3D · model evidence`
              : correctionPending
                ? 'Model pending footprint correction'
                : 'Model needs rebuilding after geometry changes'}
          </summary>
          <p>
            <strong>Supported:</strong> {record.observed.join(' ')}
          </p>
          <p>
            <strong>Inferred:</strong> {record.inferred.join(' ')}
          </p>
          {photoEvidence && (
            <>
              <p>
                <strong>Photographic observations:</strong>{' '}
                {photoEvidence.observed.join(' ')}
              </p>
              <p>
                <strong>Estimated model detail:</strong>{' '}
                {photoEvidence.estimated.join(' ')}
              </p>
              <p>
                <strong>Review gaps:</strong> {photoEvidence.needed.join(' ')}
              </p>
              <small>
                Evidence checked {photoEvidence.checkedAt.slice(0, 10)}
              </small>
            </>
          )}
          {data.visuals?.textures
            ?.filter((t) => photoIds.has(t.photoId))
            .map((t) => (
              <p key={t.id}>
                {t.attribution} ·{' '}
                <a href={t.licenseUrl} target="_blank" rel="noreferrer">
                  {t.license}
                </a>{' '}
                · {t.modifications}
              </p>
            ))}
          {needed.length > 0 && (
            <p>
              <strong>Still needed:</strong> {needed.join(' ')}
            </p>
          )}
          {record.sources
            .map((id) => data.visuals?.references.find((r) => r.id === id))
            .filter((r) => r && r.url.startsWith('https://'))
            .map((r) => (
              <a href={r!.url} key={r!.id} target="_blank" rel="noreferrer">
                {r!.author} · {r!.date.slice(0, 10)} · {r!.license}
              </a>
            ))}
        </details>
      )}
    </div>
  );
}
