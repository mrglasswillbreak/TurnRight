import { Box, Check, X } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { createBuildingModel } from './building-model';
import { resolveBuildingVisual } from './building-surfaces';
import { modelFeature } from './model-authoring';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import ModelFilePanel from './ModelFilePanel';
import { modelDocumentRevision } from './model-document-revision';
import { bakeNativeModelMeshes } from './model-native-export';
import { useModelMesh, type ModelMeshProps } from './useModelMesh';
import { MeshGeometryTools } from './MeshGeometryTools';
import { MeshObjectSettings } from './MeshObjectSettings';
import { MeshTextureTools } from './MeshTextureTools';

export default function ModelMeshPanel(props: ModelMeshProps) {
  const state = useModelMesh(props);
  const {
    disabled,
    pending,
    commit,
    setPending,
    workspace,
    edit,
    onPreview,
    document,
    selection,
    data,
    object,
    select,
    onCommit,
    error,
  } = state;

  return (
    <section
      className="model-mesh-panel"
      data-mobile-panel="mode"
      aria-label="Mesh editing tools"
    >
      <p>
        Architectural footprints remain separate from mesh geometry. Select
        parts in the model or structure tree.
      </p>
      {disabled && (
        <output>
          Mesh editing requires an available 3D view and your current changes.
        </output>
      )}
      {pending && (
        <div className="model-notice">
          <p>A model candidate is retained locally.</p>
          <ModelButton icon={<Check />} onClick={() => commit(pending)}>
            Apply pending model
          </ModelButton>
          <ModelButton
            icon={<X />}
            onClick={() => {
              setPending(null);
              workspace?.recoverModelInput(edit.id, 'mesh:candidate');
              onPreview(null);
            }}
          >
            Discard pending model
          </ModelButton>
        </div>
      )}
      <ModelFilePanel
        buildingId={edit.id}
        workspace={workspace}
        document={document}
        selection={selection}
        onCommit={commit}
        onPreview={onPreview}
        disabled={disabled}
        native={async () => {
          const feature = modelFeature({
            ...edit,
            properties: { ...edit.properties, modelDocument: undefined },
          });
          const native = createBuildingModel(
            feature as Feature<Polygon | MultiPolygon>,
            resolveBuildingVisual(
              feature,
              data.visuals?.buildings.find((v) => v.id === edit.id),
            ),
            { previewUnreviewed: true },
          );
          const k = (Math.PI / 180) * 6371008.8,
            offset = [
              (native.origin[0] - document.origin[0]) *
                k *
                Math.cos((document.origin[1] * Math.PI) / 180),
              (native.origin[1] - document.origin[1]) * k,
              0,
            ];
          return bakeNativeModelMeshes(
            native.meshes.map((m) => ({
              ...m,
              positions: m.positions.map((n, i) => n + offset[i % 3]),
            })),
            data,
          );
        }}
      />
      <MeshGeometryTools state={state} />
      <label>
        Model object
        <select
          value={object?.id || ''}
          onChange={(e) =>
            select({ objectId: e.target.value, kind: 'object', ids: [] })
          }
        >
          <option value="">Choose an object</option>
          {document.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.locked ? ' · locked' : ''}
              {o.hidden ? ' · hidden' : ''}
            </option>
          ))}
        </select>
      </label>
      <MeshObjectSettings state={state} />
      <MeshTextureTools key={object?.id || 'none'} state={state} />
      {!document.objects.length && (
        <p>
          <Box size={16} /> Add a primitive, copy the building, or import a
          model to begin.
        </p>
      )}
      {edit.properties.modelDocument && (
        <div className="model-notice">
          <p>
            {edit.properties.reviewedModelRevision ===
            modelDocumentRevision(document)
              ? 'Authored geometry reviewed. Publication still requires a release preview.'
              : 'Authored geometry needs review before it can be published.'}
          </p>
          <ModelButton
            icon={<Check />}
            disabled={
              disabled ||
              !!pending ||
              edit.properties.reviewedModelRevision ===
                modelDocumentRevision(document)
            }
            onClick={() =>
              onCommit({
                ...edit,
                properties: {
                  ...edit.properties,
                  reviewedModelRevision: modelDocumentRevision(document),
                },
              })
            }
          >
            Mark authored model reviewed
          </ModelButton>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
