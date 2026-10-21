import { Suspense } from 'react';
import type { PhotoChange } from './photo-workspace';
import type { CampusPhoto } from './types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CampusData, MapEdit } from './types';
import { repairArcGisParts } from './arcgis-rings';
import type { Geometry } from 'geojson';
import { PhotoManager } from './inspector-photo-loader';

export type EditorInspectorProps = {
  edit: MapEdit;
  buildingEditor?: ReactNode;
  data: CampusData;
  issues: string[];
  onProperty: (key: string, value: unknown, continuous?: boolean) => void;
  onEndField: () => void;
  focusField?: string;
  onGeometry: (geometry: Geometry) => void;
  onLayerGeometry?: (
    operation: 'hole' | 'regenerate' | 'square' | 'straighten',
  ) => void;
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
};
export function useEditorInspector({
  edit,
  buildingEditor,
  data,
  issues,
  onProperty,
  onEndField,
  focusField,
  onGeometry,
  onLayerGeometry,
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
}: EditorInspectorProps) {
  const [search, setSearch] = useState('');

  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusField) return;
    // The portal registers its pane before the shell exposes and sizes it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        panel.current
          ?.querySelector<HTMLElement>(`[data-editor-field="${focusField}"]`)
          ?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
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
  return {
    panel,
    onEndField,
    edit,
    p,
    onClose,
    photoTools,
    field,
    onLayerGeometry,
    onProperty,
    onEntrance,
    repair,
    onGeometry,
    buildingEditor,
    data,
    search,
    setSearch,
    onApproach,
    onPick,
    onDisconnect,
    issues,
    onRestorePublished,
    onDelete,
  };
}
export type EditorInspectorState = ReturnType<typeof useEditorInspector>;
