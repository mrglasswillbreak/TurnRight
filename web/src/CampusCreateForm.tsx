import { FileUp, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from './supabase';
import { campusUrl } from './campus-context';
import { setPreference } from './offline';
import { ImportMapPreview } from './ImportMapPreview';
import type { CampusData } from './types';
import { Identity } from './campus-import-configuration';
import type { CampusWorkspaceState } from './useCampusWorkspace';

export function CampusCreateForm({ state }: { state: CampusWorkspaceState }) {
  const {
    setCreating,
    name,
    setName,
    setSlug,
    slug,
    centre,
    setCentre,
    setError,
    setPreviewCampus,
    current,
    drawing,
    setDrawing,
    vertices,
    setVertices,
    boundaryCampus,
    importedBoundary,
    dark,
    boundaryText,
    setBoundaryText,
    boundaryChoices,
    boundaryIndex,
    setBoundaryIndex,
    busy,
    run,
    recoveryKey,
    onSwitch,
  } = state;

  return (
    <>
      <div className="campus-title">
        <h3>Create a campus</h3>
        <Button variant="ghost" onClick={() => setCreating(false)}>
          Cancel
        </Button>
      </div>
      <div className="campus-fields">
        <label>
          Campus name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              );
            }}
            placeholder="University · North campus"
            maxLength={160}
          />
        </label>
        <label>
          Public URL name
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={80}
          />
          <small>{campusUrl('/', slug || 'new-campus')}</small>
        </label>
      </div>
      <p>
        Move the map to the location, then draw its boundary. You can also paste
        or upload a GeoJSON polygon.
      </p>
      <div className="campus-actions">
        <input
          aria-label="Map centre longitude, latitude"
          placeholder="Longitude, latitude"
          value={centre}
          onChange={(e) => setCentre(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            const [x, y] = centre.split(',').map(Number);
            if (
              !Number.isFinite(x) ||
              !Number.isFinite(y) ||
              Math.abs(x) > 180 ||
              Math.abs(y) > 90
            ) {
              setError('Enter longitude, latitude within world bounds.');
              return;
            }
            setPreviewCampus({
              ...current,
              bounds: [
                [x - 0.01, y - 0.01],
                [x + 0.01, y + 0.01],
              ],
            });
          }}
        >
          Go to location
        </Button>
        <Button
          variant={drawing ? 'default' : 'outline'}
          onClick={() => setDrawing(!drawing)}
        >
          <MapPin />
          {drawing ? 'Drawing boundary' : 'Draw boundary'}
        </Button>
        <Button
          variant="ghost"
          disabled={!vertices.length}
          onClick={() => setVertices((v) => v.slice(0, -1))}
        >
          Undo point
        </Button>
      </div>
      <ImportMapPreview
        key={JSON.stringify(boundaryCampus.bounds)}
        campus={boundaryCampus}
        boundary={importedBoundary}
        dark={dark}
        drawing={drawing}
        vertices={vertices}
        onVertex={(p) => setVertices((v) => [...v, p])}
      />
      <label>
        Boundary GeoJSON
        <textarea
          rows={3}
          value={boundaryText}
          onChange={(e) => setBoundaryText(e.target.value)}
          placeholder="Paste a Polygon, MultiPolygon, Feature or FeatureCollection"
        />
      </label>
      {boundaryChoices.length > 1 && (
        <label>
          Choose imported boundary
          <select
            value={boundaryIndex}
            onChange={(e) => setBoundaryIndex(Number(e.target.value))}
          >
            {boundaryChoices.map((f, i) => (
              <option key={i} value={i}>
                {String(
                  f.properties?.name ||
                    f.properties?.NAME ||
                    `Boundary ${i + 1}`,
                )}
              </option>
            ))}
          </select>
        </label>
      )}
      {boundaryText && !importedBoundary && (
        <p className="campus-error">
          Choose a GeoJSON polygon or a collection containing a polygon.
          Coordinates must use WGS84 longitude, latitude.
        </p>
      )}
      <label className="campus-file">
        <FileUp size={18} /> Import boundary GeoJSON
        <input
          type="file"
          accept=".geojson,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void file
                .text()
                .then(setBoundaryText)
                .catch((err) => setError(err.message));
          }}
        />
      </label>
      <div className="campus-actions">
        <span>{vertices.length} drawn points</span>
        <Button
          disabled={
            busy ||
            !name ||
            !slug ||
            (boundaryText ? !importedBoundary : vertices.length < 3)
          }
          onClick={() =>
            void run(async () => {
              let boundary: CampusData['boundary'];
              if (boundaryText) {
                boundary = importedBoundary;
              } else
                boundary = {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Polygon',
                    coordinates: [[...vertices, vertices[0]]],
                  },
                };
              const result = await api<{ campus: Identity }>('campus-create', {
                name,
                slug,
                boundary,
              });
              await setPreference(recoveryKey, null);
              await onSwitch(result.campus);
            })
          }
        >
          <Plus /> Create campus
        </Button>
      </div>
    </>
  );
}
