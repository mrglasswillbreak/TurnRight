import { Copy, Plus } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { defaultModelMaterial, modelId } from './model-document';
import { primitive, type PrimitiveKind } from './model-primitives';
import { ModelCurveProfileForm } from './ModelCurveProfileForm';
import type { ModelMeshState } from './useModelMesh';

export function MeshGeometryTools({ state }: { state: ModelMeshState }) {
  const {
    disabled,
    shape,
    setShape,
    attempt,
    edit,
    commit,
    document,
    select,
    copyNative,
    workspace,
  } = state;

  return (
    <fieldset disabled={disabled}>
      <legend>Add geometry</legend>
      <label>
        Primitive
        <select
          value={shape}
          onChange={(e) => setShape(e.target.value as PrimitiveKind)}
        >
          {[
            'box',
            'plane',
            'cylinder',
            'cone',
            'sphere',
            'torus',
            'ellipse',
          ].map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <ModelButton
        icon={<Plus />}
        variant="secondary"
        onClick={() =>
          attempt(() => {
            const object = primitive(shape),
              material = {
                ...defaultModelMaterial(),
                id: modelId(),
                name: `${object.name} surface`,
              };
            object.faces.forEach((f) => (f.material = material.id));
            object.transform.position[2] = Number(edit.properties.height) || 6;
            if (
              commit({
                ...document,
                objects: [...document.objects, object],
                materials: [...document.materials, material],
              })
            )
              select({ objectId: object.id, kind: 'object', ids: [] });
          })
        }
      >
        Add primitive
      </ModelButton>
      <ModelButton icon={<Copy />} onClick={copyNative}>
        Create editable mesh copy
      </ModelButton>
      <ModelCurveProfileForm
        buildingId={edit.id}
        workspace={workspace}
        onAdd={(object) => {
          const material = {
            ...defaultModelMaterial(),
            id: modelId(),
            name: 'Profile surface',
          };
          object.faces.forEach((f) => (f.material = material.id));
          if (
            !commit({
              ...document,
              objects: [...document.objects, object],
              materials: [...document.materials, material],
            })
          )
            return false;
          select({ objectId: object.id, kind: 'object', ids: [] });
          return true;
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={document.replaceVisual}
          onChange={(e) =>
            commit({ ...document, replaceVisual: e.target.checked })
          }
        />
        Replace building visual
      </label>
    </fieldset>
  );
}
