import { Group as ActionGroup, Ungroup } from 'lucide-react';
import { patternSlots } from './model-authoring';
import { ModelButton } from './ModelButton';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelSelectionActionsBindings } from './useModelSelectionActions';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'workspace'
  | 'setSelected'
  | 'before'
  | 'setWholeRows'
  | 'setPaste'
  | 'name'
  | 'setName'
  | 'pattern'
  | 'setPattern'
  | 'patternId'
  | 'setPatternId'
  | 'setTargetWall'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    'draft' | 'activeWall' | 'authoring' | 'elements' | 'selected' | 'locked'
  > &
  Pick<ModelCommitBindings, 'commit' | 'updateElements'> &
  Pick<ModelDetailCommandsBindings, 'stamp' | 'editPattern'> &
  Pick<ModelSelectionActionsBindings, 'grouped' | 'ungroupSelection'>;
export function ModelPatternProperties(props: Props) {
  const {
    workspace,
    setSelected,
    before,
    setWholeRows,
    setPaste,
    name,
    setName,
    pattern,
    setPattern,
    patternId,
    setPatternId,
    setTargetWall,
    draft,
    activeWall,
    authoring,
    elements,
    selected,
    locked,
    commit,
    updateElements,
    stamp,
    editPattern,
    grouped,
    ungroupSelection,
  } = props;
  return (
    <details>
      <summary>Groups, patterns &amp; presets</summary>
      <label>
        Name
        <input
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="model-toolbar">
        <ModelButton
          variant="outline"
          icon={<ActionGroup />}
          disabled={!selected.length}
          onClick={() =>
            updateElements(elements, {
              ...authoring,
              groups: [
                ...authoring.groups,
                {
                  id: crypto.randomUUID(),
                  name: name.trim() || 'Detail group',
                  wallId: activeWall,
                  members: selected,
                },
              ],
            })
          }
        >
          Group selection
        </ModelButton>
        <ModelButton
          icon={<Ungroup />}
          disabled={
            !grouped || before || selected.some((id) => locked.includes(id))
          }
          onClick={ungroupSelection}
        >
          Ungroup
        </ModelButton>
        <ModelButton
          variant="outline"
          disabled={!selected.length}
          onClick={() =>
            commit({
              ...draft,
              properties: {
                ...draft.properties,
                modelAuthoring: {
                  ...authoring,
                  presets: [
                    ...authoring.presets,
                    {
                      id: crypto.randomUUID(),
                      ...stamp(),
                    },
                  ],
                },
              },
            })
          }
        >
          Save preset
        </ModelButton>
      </div>
      <label>
        Pattern
        <select
          value={patternId}
          onChange={(e) => {
            setPatternId(e.target.value);
            const p = authoring.patterns.find((p) => p.id === e.target.value);
            if (p) {
              setWholeRows(p.members);
              setSelected(p.members);
              setPattern({
                rows: p.rows,
                columns: p.columns,
                stepX: p.stepX,
                stepY: p.stepY,
              });
            }
          }}
        >
          <option value="">New from selection</option>
          {authoring.patterns
            .filter((p) => p.wallId === activeWall)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      {(['rows', 'columns', 'stepX', 'stepY'] as const).map((k) => (
        <label key={k}>
          {
            {
              rows: 'Rows',
              columns: 'Columns',
              stepX: 'Horizontal step (m)',
              stepY: 'Vertical step (m)',
            }[k]
          }
          <input
            type="number"
            min={k === 'rows' || k === 'columns' ? 1 : 0}
            step={k === 'rows' || k === 'columns' ? 1 : 0.1}
            value={Number.isFinite(pattern[k]) ? pattern[k] : ''}
            onChange={(e) =>
              setPattern({
                ...pattern,
                [k]: e.target.value === '' ? NaN : Number(e.target.value),
              })
            }
          />
        </label>
      ))}
      <ModelButton variant="outline" onClick={editPattern}>
        {patternId ? 'Update pattern' : 'Create pattern'}
      </ModelButton>
      <ModelButton
        variant="outline"
        disabled={!patternId || selected.length !== 1}
        onClick={() => {
          const p = authoring.patterns.find((p) => p.id === patternId);
          if (p)
            commit({
              ...draft,
              properties: {
                ...draft.properties,
                modelAuthoring: {
                  ...authoring,
                  patterns: authoring.patterns.map((v) =>
                    v.id === p.id
                      ? {
                          ...v,
                          members: v.members.filter(
                            (id) => !selected.includes(id),
                          ),
                          slots: patternSlots(v).filter(
                            (_, i) => !selected.includes(v.members[i]),
                          ),
                          excluded: [
                            ...new Set([
                              ...(v.excluded || []),
                              ...patternSlots(v).filter((_, i) =>
                                selected.includes(v.members[i]),
                              ),
                            ]),
                          ],
                        }
                      : v,
                  ),
                },
              },
            });
        }}
      >
        Detach detail from pattern
      </ModelButton>
      {(workspace?.edits || [draft]).flatMap((e) =>
        (e.properties.modelAuthoring?.presets || []).map((p) => (
          <ModelButton
            variant="outline"
            key={`${e.id}:${p.id}`}
            onClick={() => {
              setPaste(p);
              setTargetWall(activeWall);
            }}
          >
            Insert preset · {p.name}
          </ModelButton>
        )),
      )}
    </details>
  );
}
