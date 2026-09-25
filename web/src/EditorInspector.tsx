import { DrivingEditor } from './DrivingEditor';
import { ArrivalEditor } from './ArrivalEditor';
import { lazy, Suspense } from 'react';
const PhotoManager = lazy(() =>
  import('./PhotoManager').then((m) => ({ default: m.PhotoManager })),
);
import type { PhotoChange } from './photo-workspace';
import type { CampusPhoto } from './types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { DoorOpen, Route, Trash2, Unlink, X } from 'lucide-react';
import type { CampusData, MapEdit } from './types';
import { BuildingVisualDetails } from './BuildingVisualDetails';
import { repairArcGisParts } from './arcgis-rings';
import type { Geometry } from 'geojson';

export function EditorInspector({
  edit,
  buildingEditor,
  data,
  issues,
  onProperty,
  onEndField,
  focusField,
  onGeometry,
  onEntrance,
  onApproach,
  onPick,
  onDisconnect,
  onDelete,
  onRestorePublished,
  onClose,
  photoOwner,
  onPhotos,
  onPhotoUndo,
  photoSaveStatus,
  publishedPhotos,
}: {
  edit: MapEdit;
  buildingEditor?: ReactNode;
  data: CampusData;
  issues: string[];
  onProperty: (key: string, value: unknown, continuous?: boolean) => void;
  onEndField: () => void;
  focusField?: string;
  onGeometry: (geometry: Geometry) => void;
  onEntrance: () => void;
  onApproach: () => void;
  onPick: (mode: 'start' | 'end' | 'join' | 'entrance-link' | 'block') => void;
  onDisconnect: (vertexId?: string) => void;
  onDelete: () => void;
  onRestorePublished?: () => void;
  onClose: () => void;
  photoOwner: string;
  onPhotos: (change: PhotoChange) => void;
  onPhotoUndo: () => void;
  photoSaveStatus: string;
  publishedPhotos?: CampusPhoto[];
}) {
  const [search, setSearch] = useState('');
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusField)
      panel.current
        ?.querySelector<HTMLElement>(`[data-editor-field="${focusField}"]`)
        ?.focus();
  }, [focusField, edit.id]);
  const p = edit.properties;
  const repair =
    edit.kind === 'building'
      ? repairArcGisParts({
          type: 'Feature',
          properties: p,
          geometry: edit.geometry,
        })
      : undefined;
  const field = (label: string, key: string, placeholder = '') => (
    <label className="field-label">
      {label}
      <input
        data-editor-field={key}
        value={String(p[key] ?? '')}
        placeholder={placeholder}
        onChange={(e) => onProperty(key, e.target.value, true)}
      />
    </label>
  );
  const photoTools = (
    <Suspense fallback={<p>Loading photo tools…</p>}>
      <PhotoManager
        edit={edit}
        data={data}
        owner={photoOwner}
        onApply={onPhotos}
        onUndo={onPhotoUndo}
        saveStatus={photoSaveStatus}
        publishedPhotos={publishedPhotos}
      />
    </Suspense>
  );
  return (
    <aside
      ref={panel}
      onBlurCapture={onEndField}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter') onEndField();
      }}
      className="editor-inspector editor-card"
      aria-label="Feature properties"
    >
      <div className="editor-panel-heading">
        <div>
          <span className="editor-eyebrow">{edit.kind}</span>
          <h2>{String(p.name || 'New feature')}</h2>
        </div>
        <button
          className="editor-icon"
          aria-label="Close properties"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <div className="editor-inspector-body">
        {edit.deleted && (
          <p className="notice">Removed from this draft. Undo to restore it.</p>
        )}
        {edit.kind === 'building' && photoTools}
        {field('Name', 'name', 'Give this feature a useful name')}
        {(edit.kind === 'place' || edit.kind === 'building') && (
          <button className="editor-primary" onClick={onEntrance}>
            <DoorOpen size={16} /> Add entrance
          </button>
        )}
        {edit.kind === 'place' && (
          <>
            <label className="field-label">
              Category
              <select
                value={String(p.category || 'other')}
                onChange={(e) => onProperty('category', e.target.value)}
              >
                {[
                  'academic',
                  'library',
                  'food',
                  'services',
                  'worship',
                  'residence',
                  'sports',
                  'gate',
                  'other',
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {field('Also known as', 'aliases', 'Separate names with commas')}
            {field('Department', 'department')}
            {field('Faculty', 'faculty')}
            <details>
              <summary>Business details and evidence</summary>
              {field('Type of place', 'subtype', 'restaurant, cafe, bookshop…')}
              {field('Address', 'address')}
              {field('Public business phone', 'phone')}
              {field('Website', 'website', 'https://…')}
              {field(
                'Recorded opening hours',
                'openingHours',
                'Recorded schedule, not live status',
              )}
              <label className="field-label">
                Recorded business status
                <select
                  value={String(p.businessStatus || 'unknown')}
                  onChange={(e) => onProperty('businessStatus', e.target.value)}
                >
                  <option value="unknown">Unknown</option>
                  <option value="operating">Operating business</option>
                  <option value="temporarily-closed">Temporarily closed</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              {field(
                'Evidence source for changed details',
                'detailSource',
                'Source URL or campus observation reference',
              )}
              <label className="field-label">
                Date checked
                <input
                  type="date"
                  value={String(p.detailCheckedAt || '').slice(0, 10)}
                  onChange={(e) =>
                    onProperty('detailCheckedAt', e.target.value)
                  }
                />
              </label>
              <p className="small-note">
                Record only supported details. Source evidence is public; keep
                private survey notes out of these fields.
              </p>
            </details>
          </>
        )}
        {edit.kind === 'building' && (
          <>
            {repair && (
              <div className="notice">
                <strong>Separate wings need a geometry correction</strong>
                <p>
                  This imported outline treats {repair.coordinates.length}{' '}
                  separate parts as courtyard holes. Regrouping keeps every
                  coordinate, this building ID and its entrances. Review the
                  result on the map; Undo restores it.
                </p>
                <button
                  className="editor-primary"
                  onClick={() => onGeometry(repair)}
                >
                  Review corrected wings
                </button>
              </div>
            )}
            {buildingEditor}
            <BuildingVisualDetails
              data={data}
              feature={{
                type: 'Feature',
                properties: { ...p, id: edit.id },
                geometry: edit.geometry,
              }}
            />

          </>
        )}
        {edit.kind === 'entrance' && (
          <>
            <label className="field-label">
              Serves this place
              <input
                aria-label="Search entrance place"
                type="search"
                placeholder="Search campus places…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Entrance place"
                data-editor-field="placeId"
                value={String(p.placeId || '')}
                onChange={(e) => onProperty('placeId', e.target.value)}
              >
                <option value="">Choose a place</option>
                {data.places
                  .filter(
                    (place) =>
                      place.id === p.placeId ||
                      place.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((place) => (
                    <option value={place.id} key={place.id}>
                      {place.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="editor-primary" onClick={onApproach}>
              <Route size={16} /> Draw connecting path
            </button>
            <button
              className="editor-secondary"
              onClick={() => onPick('entrance-link')}
            >
              Connect at an existing path
            </button>
            {p.connection || p.connectTo ? (
              <button className="editor-text" onClick={() => onDisconnect()}>
                <Unlink size={14} /> Disconnect entrance
              </button>
            ) : (
              <p className="small-note">
                Draw an approach from this entrance to the walking network.
              </p>
            )}
          </>
        )}
        <DrivingEditor edit={edit} data={data} onProperty={onProperty} />
        <ArrivalEditor
          key={edit.id}
          edit={edit}
          data={data}
          onProperty={onProperty}
        />
        {edit.kind !== 'building' && photoTools}
        {(edit.kind === 'path' || edit.kind === 'entrance') && (
          <label className="field-label">
            Walking access
            <select
              value={String(p.access || 'yes')}
              onChange={(e) => onProperty('access', e.target.value)}
            >
              <option value="yes">Public walking permitted</option>
              <option value="campus">Student walking permitted</option>
              <option value="private">Private / restricted</option>
              <option value="no">No walking access</option>
            </select>
          </label>
        )}
        {edit.kind === 'path' && (
          <>
            <label className="field-label">
              Walking direction
              <select
                value={String(p.footDirection || 'both')}
                onChange={(e) => onProperty('footDirection', e.target.value)}
              >
                <option value="both">Both directions</option>
                <option value="forward">Along the drawn line</option>
                <option value="reverse">Against the drawn line</option>
              </select>
            </label>
            <label className="field-label">
              Recorded steps information
              <select
                value={
                  p.steps === true
                    ? 'yes'
                    : p.steps === false
                      ? 'no'
                      : 'unknown'
                }
                onChange={(e) =>
                  onProperty(
                    'steps',
                    e.target.value === 'unknown'
                      ? null
                      : e.target.value === 'yes',
                  )
                }
              >
                <option value="unknown">Unknown</option>
                <option value="yes">Includes steps</option>
                <option value="no">Recorded without steps</option>
              </select>
            </label>
            <div className="editor-field-title">Path connections</div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={p.autoConnectCrossings !== false}
                onChange={(e) =>
                  onProperty('autoConnectCrossings', e.target.checked)
                }
              />
              Connect crossings automatically
            </label>
            <label className="field-label">
              Crossing level
              <select
                value={String(p.crossingLevel || 'source')}
                onChange={(e) => onProperty('crossingLevel', e.target.value)}
              >
                <option value="source">
                  Use mapped level (ground if unknown)
                </option>
                <option value="ground">Ground</option>
                <option value="bridge">Bridge / above ground</option>
                <option value="tunnel">Tunnel / below ground</option>
              </select>
            </label>
            <div className="editor-two-buttons">
              <button
                className="editor-secondary"
                onClick={() => onPick('start')}
              >
                Connect start
              </button>
              <button
                className="editor-secondary"
                onClick={() => onPick('end')}
              >
                Connect end
              </button>
            </div>
            <button className="editor-secondary" onClick={() => onPick('join')}>
              Join here · click a crossing
            </button>
            {p.connections?.map((c, i) => (
              <div className="editor-connection" key={`${c.vertexId}:${i}`}>
                <span>
                  Connected{' '}
                  {p.vertexIds?.[0] === c.vertexId
                    ? 'start'
                    : p.vertexIds?.at(-1) === c.vertexId
                      ? 'end'
                      : 'junction'}
                </span>
                <button
                  className="editor-icon"
                  aria-label={`Disconnect connection ${i + 1}`}
                  onClick={() => onDisconnect(c.vertexId)}
                >
                  <Unlink size={15} />
                </button>
              </div>
            ))}
            <p className="small-note">
              Crossings at the same level connect automatically. Turn this off
              to choose connections with Connect start, Connect end or Join
              here. Existing manual connections are retained.
            </p>
          </>
        )}
        {(edit.kind === 'closure' || edit.kind === 'barrier') && (
          <>
            <button className="editor-primary" onClick={() => onPick('block')}>
              Select path segment to block
            </button>
            <p className="small-note">
              {Array.isArray(p.edgeIds) ? p.edgeIds.length : 0} segment
              references selected. Both walking directions are blocked.
            </p>
            <label className="field-label">
              Expected reopening
              <input
                type="datetime-local"
                value={String(p.expectedReopening || '').slice(0, 16)}
                onChange={(e) =>
                  onProperty('expectedReopening', e.target.value, true)
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!p.reopenedAt}
                onChange={(e) =>
                  onProperty(
                    'reopenedAt',
                    e.target.checked ? new Date().toISOString() : undefined,
                  )
                }
              />{' '}
              Confirmed reopened
            </label>
            <p className="small-note">
              An expected date does not reopen a path automatically.
            </p>
          </>
        )}
        {issues.length > 0 && (
          <div className="editor-issues">
            <strong>Needs attention</strong>
            {issues.map((issue) => (
              <p key={issue}>{issue.replace(`${edit.id}: `, '')}</p>
            ))}
          </div>
        )}
        {onRestorePublished && (
          <button className="editor-secondary" onClick={onRestorePublished}>
            Restore published building
          </button>
        )}
        <button
          className="editor-delete"
          onClick={onDelete}
          disabled={edit.deleted}
        >
          <Trash2 size={15} /> Remove {edit.kind}
        </button>
      </div>
    </aside>
  );
}
