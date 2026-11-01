import { Eye, EyeOff, LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';
import type { ModelMeshState } from './useModelMesh';
import { MeshTransformTools } from './MeshTransformTools';
export function MeshObjectSettings({ state }: { state: ModelMeshState }) {
  const {
    object,
    edit,
    workspace,
    changeObject,
    material,
    disabled,
    commit,
    document,
  } = state;

  return (
    <>
      {object && (
        <>
          <ModelField
            label="Object name"
            type="text"
            value={object.name}
            buildingId={edit.id}
            field={`mesh:${object.id}:name`}
            workspace={workspace}
            onCommit={(name) => changeObject({ ...object, name })}
          />
          <div className="model-toolbar">
            <ModelButton
              icon={object.hidden ? <Eye /> : <EyeOff />}
              onClick={() =>
                changeObject({ ...object, hidden: !object.hidden })
              }
            >
              {object.hidden ? 'Show object' : 'Hide object'}
            </ModelButton>
            <ModelButton
              icon={object.locked ? <LockKeyholeOpen /> : <LockKeyhole />}
              onClick={() =>
                changeObject({ ...object, locked: !object.locked })
              }
            >
              {object.locked ? 'Unlock object' : 'Lock object'}
            </ModelButton>
          </div>
          <MeshTransformTools state={state} />
          <label>
            Distance detail
            <select
              value={object.detailTier || 'structure'}
              disabled={disabled || object.locked}
              onChange={(event) =>
                changeObject({
                  ...object,
                  detailTier: event.target.value as
                    | 'structure'
                    | 'facade'
                    | 'fine',
                })
              }
            >
              <option value="structure">Structure · all distances</option>
              <option value="facade">Facade · medium and close views</option>
              <option value="fine">Fine detail · close views</option>
            </select>
          </label>
          {material && (
            <fieldset disabled={disabled || object.locked}>
              <legend>Material</legend>
              <label>
                Surface colour
                <input
                  type="color"
                  value={material.colour}
                  onChange={(e) =>
                    commit({
                      ...document,
                      materials: document.materials.map((m) =>
                        m.id === material.id
                          ? { ...m, colour: e.target.value }
                          : m,
                      ),
                    })
                  }
                />
              </label>
              {(['opacity', 'roughness', 'metalness'] as const).map((key) => (
                <ModelField
                  key={key}
                  label={`Material ${key}`}
                  value={material[key]}
                  min={0}
                  max={1}
                  step={0.05}
                  buildingId={edit.id}
                  field={`material:${material.id}:${key}`}
                  workspace={workspace}
                  onCommit={(value) =>
                    commit({
                      ...document,
                      materials: document.materials.map((m) =>
                        m.id === material.id
                          ? { ...m, [key]: Number(value) }
                          : m,
                      ),
                    })
                  }
                />
              ))}
            </fieldset>
          )}
        </>
      )}
    </>
  );
}
