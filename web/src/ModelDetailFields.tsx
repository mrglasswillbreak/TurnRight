import { Split } from 'lucide-react';
import { elementBounds } from './model-authoring';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelSelectionActionsBindings } from './useModelSelectionActions';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  'edit' | 'workspace' | 'instance' | 'setInstance' | 'before'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    'authoring' | 'elements' | 'selected' | 'locked' | 'active' | 'label'
  > &
  Pick<ModelCommitBindings, 'updateElements' | 'patch'> &
  Pick<ModelEditingControlsBindings, 'field'> &
  Pick<ModelSelectionActionsBindings, 'detachSelectedInstance'> & {
    metrics: NonNullable<ModelWorkspaceSelectionBindings['metrics']>;
  };
export function ModelDetailFields(props: Props) {
  const {
    edit,
    workspace,
    instance,
    setInstance,
    before,
    metrics,
    authoring,
    elements,
    selected,
    locked,
    active,
    label,
    updateElements,
    patch,
    field,
    detachSelectedInstance,
  } = props;
  return (
    active &&
    selected.length === 1 && (
      <>
        <h3>{label(active)}</h3>
        <ModelField
          label="Detail name"
          type="text"
          value={authoring.names[active.id] || ''}
          buildingId={edit.id}
          field={`name:${active.id}`}
          workspace={workspace}
          onCommit={(v) =>
            updateElements(elements, {
              ...authoring,
              names: {
                ...authoring.names,
                [active.id]: v.slice(0, 120),
              },
            })
          }
        />
        {active.kind === 'text' && (
          <>
            <ModelField
              label="Surface text"
              type="text"
              value={active.text || ''}
              buildingId={edit.id}
              field={`text:${active.id}`}
              workspace={workspace}
              disabled={locked.includes(active.id)}
              onCommit={(text) => patch(active.id, { text })}
            />
            <label>
              Text weight
              <select
                aria-label="Text weight"
                value={active.textWeight || 'bold'}
                disabled={locked.includes(active.id)}
                onChange={(e) =>
                  patch(active.id, {
                    textWeight: e.target.value as 'regular' | 'bold',
                  })
                }
              >
                <option value="regular">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <label>
              Text alignment
              <select
                aria-label="Text alignment"
                value={active.textAlign || 'center'}
                disabled={locked.includes(active.id)}
                onChange={(e) =>
                  patch(active.id, {
                    textAlign: e.target.value as 'left' | 'center' | 'right',
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
          </>
        )}
        <div className="model-properties-grid">
          {field(
            'x',
            'Centre from A (m)',
            active.x * metrics.length,
            0,
            metrics.length,
          )}
          {field('bottom', 'Bottom above base (m)', active.bottom)}
          {field('width', 'Width (m)', active.width, 0.01)}
          {field('height', 'Height (m)', active.height, 0.01)}
          {field('depth', 'Projection (m)', active.depth, 0, 10)}
          {field('count', 'Repeat count', active.count, 1, 40)}
          {field(
            'spacing',
            'Centre spacing (m)',
            active.spacing * metrics.length,
            0,
            metrics.length,
          )}
          <ModelField
            label="Material colour"
            type="color"
            value={active.colour}
            buildingId={edit.id}
            field={`${active.id}:colour`}
            workspace={workspace}
            onCommit={(v) => patch(active.id, { colour: v })}
          />
        </div>
        <p>
          Edges: {elementBounds(active, metrics.length).left.toFixed(2)}–
          {elementBounds(active, metrics.length).right.toFixed(2)} m from A.
        </p>
        {active.count > 1 && (
          <>
            <label>
              Repeated instance
              <select
                value={Math.min(instance, active.count - 1)}
                onChange={(e) => setInstance(Number(e.target.value))}
              >
                {Array.from({ length: active.count }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <ModelButton
              icon={<Split />}
              disabled={before || locked.includes(active.id)}
              onClick={detachSelectedInstance}
            >
              Detach selected instance
            </ModelButton>
          </>
        )}
      </>
    )
  );
}
