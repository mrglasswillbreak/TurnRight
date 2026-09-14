import { useEffect, useRef, useState } from 'react';
import { DoorOpen, Route, Trash2, Unlink, X } from 'lucide-react';
import type { CampusData, MapEdit } from './types';
import { BuildingVisualDetails } from './BuildingVisualDetails';
import { repairArcGisParts } from './arcgis-rings';
import type { Geometry } from 'geojson';

export function EditorInspector({
  edit,
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
  onClose,
}: {
  edit: MapEdit;
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
  onClose: () => void;
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
            <details className="building-evidence">
              <summary>Building appearance</summary>
              {(['wallColour', 'roofColour'] as const).map((key) => (
                <label className="field-label" key={key}>
                  {key === 'wallColour' ? 'Wall colour' : 'Roof colour'}
                  <input
                    type="color"
                    value={
                      p.appearance?.[key] ||
                      (key === 'wallColour' ? '#eedcc0' : '#b97760')
                    }
                    onChange={(e) =>
                      onProperty(
                        'appearance',
                        {
                          ...p.appearance,
                          [key]: e.target.value,
                        },
                        true,
                      )
                    }
                  />
                </label>
              ))}
              <label className="field-label">
                Roof form
                <select
                  value={p.appearance?.roofForm || ''}
                  onChange={(e) =>
                    onProperty('appearance', {
                      ...p.appearance,
                      roofForm: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Unknown / simplified</option>
                  <option value="flat">Flat / parapet</option>
                  <option value="hip">Hipped</option>
                  <option value="gable">Gabled</option>
                </select>
              </label>
              <label className="field-label">
                Evidence confidence
                <select
                  value={p.appearance?.confidence || 'inferred'}
                  onChange={(e) =>
                    onProperty('appearance', {
                      ...p.appearance,
                      confidence: e.target.value,
                    })
                  }
                >
                  <option value="inferred">Inferred</option>
                  <option value="observed">Observed in a reference</option>
                  <option value="documented">Documented dimensions</option>
                </select>
              </label>
              <label className="field-label">
                Appearance source / date
                <input
                  maxLength={2000}
                  value={p.appearance?.provenance || ''}
                  onChange={(e) =>
                    onProperty(
                      'appearance',
                      {
                        ...p.appearance,
                        provenance: e.target.value,
                      },
                      true,
                    )
                  }
                />
              </label>
              <label className="field-label">
                Model association
                <select
                  value={p.appearance?.modelId || ''}
                  onChange={(e) =>
                    onProperty('appearance', {
                      ...p.appearance,
                      modelId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Automatic by building identity</option>
                  {data.visuals?.buildings
                    .filter((b) => b.id === edit.id && b.sectorId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="small-note">
                Appearance changes are saved with this draft. Changed shapes,
                heights or materials use fallback rendering until the model is
                rebuilt.
              </p>
            </details>
            <BuildingVisualDetails
              data={data}
              feature={{
                type: 'Feature',
                properties: { ...p, id: edit.id },
                geometry: edit.geometry,
              }}
            />
            <label className="field-label">
              Height information
              <select
                value={String(p.heightMode || 'metres')}
                onChange={(e) => onProperty('heightMode', e.target.value)}
              >
                <option value="metres">Height in metres</option>
                <option value="floors">Documented floor count</option>
              </select>
            </label>
            {p.heightMode === 'floors' ? (
              <label className="field-label">
                Floors
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={Number(p.floors) || ''}
                  onChange={(e) =>
                    onProperty(
                      'floors',
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                      true,
                    )
                  }
                />
                <small>
                  Approximate height: {(Number(p.floors) || 0) * 3} m · 3 m per
                  floor.
                </small>
              </label>
            ) : (
              <>
                <label className="field-label">
                  Height (m)
                  <input
                    type="number"
                    min={0}
                    max={150}
                    step="0.1"
                    value={p.height === undefined ? '' : Number(p.height)}
                    placeholder="Unknown"
                    onChange={(e) =>
                      onProperty(
                        'height',
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value),
                        true,
                      )
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!p.heightEstimated}
                    onChange={(e) =>
                      onProperty('heightEstimated', e.target.checked)
                    }
                  />{' '}
                  Height is approximate
                </label>
              </>
            )}
            {field(
              'Height source / notes',
              'heightSource',
              'Survey or floor-count reference',
            )}
            <p className="small-note">
              Unknown heights use illustrative blocks in this editor. The
              placeholder is never saved as a measurement.
            </p>
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
              Click a highlighted target to join it. Lines that only cross
              remain separate.
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
