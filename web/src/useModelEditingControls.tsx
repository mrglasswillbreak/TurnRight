import { type ModelTreeTarget } from './model-tree';
import { Mode } from './model-workspace-shared';
import { ModelField } from './ModelField';
import type { MapEdit } from './types';
import type { FacadeElement, RoofDraft } from './visual-types';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Inputs = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'selection'
  | 'onSelection'
  | 'workspace'
  | 'panel'
  | 'touchTool'
  | 'setTouchTool'
  | 'openPanel'
  | 'mode'
  | 'setMode'
  | 'setSelected'
  | 'setTab'
  | 'setMeshSelection'
  | 'setWholeRows'
  | 'paste'
  | 'setPattern'
  | 'setPatternId'
  | 'setRoofDraft'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'activeWall'
    | 'metrics'
    | 'authoring'
    | 'selected'
    | 'locked'
    | 'active'
    | 'choose'
  > &
  Pick<ModelCommitBindings, 'commit' | 'patch'>;
export function useModelEditingControls({
  edit,
  selection,
  onSelection,
  workspace,
  panel,
  touchTool,
  setTouchTool,
  openPanel,
  mode,
  setMode,
  setSelected,
  setTab,
  setMeshSelection,
  setWholeRows,
  paste,
  setPattern,
  setPatternId,
  setRoofDraft,
  activeWall,
  metrics,
  authoring,
  selected,
  locked,
  active,
  choose,
  commit,
  patch,
}: Inputs) {
  const field = (
    key: keyof FacadeElement,
    title: string,
    value: number,
    min = 0,
    max = 150,
  ) =>
    active &&
    metrics && (
      <ModelField
        key={`${active.id}:${key}`}
        label={title}
        value={value}
        buildingId={edit.id}
        field={`${activeWall}:${active.id}:${key}`}
        workspace={workspace}
        min={min}
        max={max}
        step={key === 'count' ? 1 : 0.01}
        disabled={locked.includes(active.id)}
        onCommit={(v) =>
          patch(active.id, {
            [key]:
              key === 'x' || key === 'spacing'
                ? Number(v) / metrics.length
                : Number(v),
          })
        }
      />
    );
  const onRoofDraft = (value: RoofDraft | null) => {
    setRoofDraft(value);
    workspace?.draftRoof(value);
  };
  const onRoofApply = (next: MapEdit) => {
    // A completed roof command must snapshot the previous committed roof,
    // not its transient input draft, or Undo would restore a blocking draft.
    const unfinished = workspace?.roofDraft;
    workspace?.draftRoof(null);
    if (commit(next)) {
      const partId = selection?.partId || metrics?.partId;
      const roof = partId && next.properties.appearance?.roofs?.[partId];
      setRoofDraft(
        partId && roof
          ? {
              buildingId: edit.id,
              partId,
              geometryRevision: JSON.stringify(next.geometry),
              roof,
            }
          : null,
      );
      workspace?.draftRoof(null);
    } else if (unfinished) workspace?.draftRoof(unfinished);
  };
  const toggle = (list: string[], ids: string[]) =>
    ids.every((id) => list.includes(id))
      ? list.filter((id) => !ids.includes(id))
      : [...new Set([...list, ...ids])];
  const switchMode = (next: Mode) => {
    setMode(next);
    setTouchTool('select');
    setTab((current) =>
      next === 'appearance' || next === 'review'
        ? '3d'
        : current === 'surface'
          ? 'surface'
          : '3d',
    );
    openPanel(next === 'details' ? 'none' : 'mode');
  };
  const selectTreeTarget = (target: ModelTreeTarget, multi: boolean) => {
    const { kind, partId, wallId, id } = target;
    if (kind === 'meshObject' && id) {
      setMeshSelection({ objectId: id, kind: 'object', ids: [] });
      switchMode('mesh');
      return;
    }
    if (
      kind === 'wall' ||
      kind === 'detail' ||
      kind === 'group' ||
      kind === 'pattern'
    ) {
      if (!wallId) return;
      const previous = activeWall === wallId ? selected : [];
      if (mode !== 'details') switchMode('details');
      choose(wallId, kind === 'detail' ? id : undefined);
      if (kind === 'detail' && id) {
        // Choosing another detail must retain the mobile multi-select tool and
        // the open tree; otherwise the first toggle closes its own controls.
        if (touchTool === 'multi') setTouchTool('multi');
        setWholeRows(target.wholeRow ? [id] : []);
        setSelected(
          multi || touchTool === 'multi' ? toggle(previous, [id]) : [id],
        );
      }
      const collection =
        kind === 'group'
          ? authoring.groups.find((g) => g.id === id)
          : kind === 'pattern'
            ? authoring.patterns.find((p) => p.id === id)
            : undefined;
      if (collection) {
        setWholeRows(collection.members);
        setSelected(collection.members);
      }
      if (kind === 'pattern') {
        const p = authoring.patterns.find((p) => p.id === id);
        if (p) {
          setPatternId(p.id);
          setPattern({
            rows: p.rows,
            columns: p.columns,
            stepX: p.stepX,
            stepY: p.stepY,
          });
        }
      }
    } else {
      setSelected([]);
      onSelection({
        buildingId: edit.id,
        partId,
        role: kind === 'roof' || kind === 'roofText' ? 'roof' : undefined,
        elementId: kind === 'roofText' ? id : undefined,
      });
      switchMode(
        kind === 'footprint'
          ? 'outline'
          : kind === 'roof' || kind === 'roofText'
            ? 'roof'
            : 'appearance',
      );
    }
  };
  const mobilePanel = paste ? 'copy' : panel;
  return {
    field,
    onRoofDraft,
    onRoofApply,
    switchMode,
    selectTreeTarget,
    mobilePanel,
  };
}
export type ModelEditingControlsBindings = ReturnType<
  typeof useModelEditingControls
>;
