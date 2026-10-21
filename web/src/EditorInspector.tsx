import { WorkspacePane } from './WorkspaceFrame';
import { DrivingEditor } from './DrivingEditor';
import { ArrivalEditor } from './ArrivalEditor';
import { DoorOpen, Trash2, X } from 'lucide-react';
import { BuildingVisualDetails } from './BuildingVisualDetails';
import {
  useEditorInspector,
  type EditorInspectorProps,
} from './useEditorInspector';
import { InspectorRoadProperties } from './InspectorRoadProperties';
import { InspectorLayerProperties } from './InspectorLayerProperties';
import { InspectorPlaceProperties } from './InspectorPlaceProperties';
import { InspectorEntranceProperties } from './InspectorEntranceProperties';
import { InspectorPathProperties } from './InspectorPathProperties';

export function EditorInspector(props: EditorInspectorProps) {
  const viewState = useEditorInspector(props);
  const {
    panel,
    onEndField,
    edit,
    p,
    onClose,
    photoTools,
    field,
    onLayerGeometry,
    onEntrance,
    repair,
    onGeometry,
    buildingEditor,
    data,
    onProperty,
    onPick,
    issues,
    onRestorePublished,
    onDelete,
  } = viewState;

  return (
    <WorkspacePane id="right" title="Properties">
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
            <span className="editor-eyebrow">
              {edit.kind === 'path'
                ? 'Routing path'
                : edit.kind === 'land' &&
                    ['road', 'sidewalk'].includes(String(p.landClass))
                  ? 'Road surface'
                  : edit.kind}
            </span>
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
            <p className="notice">
              Removed from this draft. Undo to restore it.
            </p>
          )}
          {edit.kind === 'building' && photoTools}
          {field('Name', 'name', 'Give this feature a useful name')}
          {['land', 'overlay', 'path'].includes(edit.kind) && (
            <p className="small-note">
              Application ID: {edit.id}
              <br />
              Source ID: {String(p.sourceId || 'Owner-created')} ·{' '}
              {String(
                p.importLayer || p.mapLayerSource || p.source || 'Campus',
              )}
            </p>
          )}
          {['land', 'overlay'].includes(edit.kind) && (
            <button onClick={() => onLayerGeometry?.('hole')}>
              Parts, holes and geometry tools
            </button>
          )}
          {['building', 'path', 'barrier'].includes(edit.kind) && (
            <button
              onClick={() =>
                onLayerGeometry?.(
                  edit.kind === 'building' ? 'square' : 'straighten',
                )
              }
            >
              Precision geometry tools
            </button>
          )}
          {(edit.kind === 'path' || !!p.derivedSurface) && (
            <button onClick={() => onLayerGeometry?.('regenerate')}>
              Preview linked road surfaces
            </button>
          )}
          <InspectorRoadProperties state={viewState} />
          <InspectorLayerProperties state={viewState} />
          {(edit.kind === 'place' || edit.kind === 'building') && (
            <button className="editor-primary" onClick={onEntrance}>
              <DoorOpen size={16} /> Add entrance
            </button>
          )}
          <InspectorPlaceProperties state={viewState} />
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
          <InspectorEntranceProperties state={viewState} />
          {['path', 'place', 'entrance', 'barrier', 'closure'].includes(
            edit.kind,
          ) && (
            <DrivingEditor edit={edit} data={data} onProperty={onProperty} />
          )}
          <ArrivalEditor
            key={edit.id}
            edit={edit}
            data={data}
            onProperty={onProperty}
          />
          {['entrance', 'place'].includes(edit.kind) && photoTools}
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
          <InspectorPathProperties state={viewState} />
          {(edit.kind === 'closure' || edit.kind === 'barrier') && (
            <>
              <button
                className="editor-primary"
                onClick={() => onPick('block')}
              >
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
    </WorkspacePane>
  );
}
