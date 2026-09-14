import type { Feature } from 'geojson';
import type { CampusData } from './types';
import { buildingDisplay } from './map-display';
import { compatibleVisual } from './building-visuals';
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
              ? `${record.level === 'extrusion' ? 'Illustrative' : record.level === 'detailed' ? 'Detailed' : 'Simplified'} 3D · model evidence`
              : record.geometryReview
                ? 'Model pending footprint correction'
                : 'Model needs rebuilding after geometry changes'}
          </summary>
          <p>
            <strong>Supported:</strong> {record.observed.join(' ')}
          </p>
          <p>
            <strong>Inferred:</strong> {record.inferred.join(' ')}
          </p>
          {record.needed.length > 0 && (
            <p>
              <strong>Still needed:</strong> {record.needed.join(' ')}
            </p>
          )}
          {record.sources
            .map((id) => data.visuals?.references.find((r) => r.id === id))
            .filter((r) => r && /^https:\/\//.test(r.url))
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
