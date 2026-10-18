import {
  copyElements,
  editableFacade,
  emptyAuthoring,
  modelFeature,
  placementErrors,
  regeneratePattern,
  wallMetrics,
} from './model-authoring';
import { Stamp } from './model-workspace-shared';
import type { FacadeElement, FacadeElementKind } from './visual-types';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Inputs = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'data'
  | 'setSelected'
  | 'before'
  | 'setError'
  | 'grid'
  | 'paste'
  | 'setPaste'
  | 'name'
  | 'pattern'
  | 'patternId'
  | 'setPatternId'
  | 'targetWall'
  | 'conversion'
  | 'pasteTransform'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'feature'
    | 'activeWall'
    | 'visual'
    | 'metrics'
    | 'authoring'
    | 'facade'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'targetEdit'
    | 'targetWalls'
    | 'choose'
  > &
  Pick<
    ModelCommitBindings,
    'commit' | 'applyWall' | 'updateElements' | 'tryAction'
  >;
export function useModelDetailCommands({
  edit,
  data,
  setSelected,
  before,
  setError,
  grid,
  paste,
  setPaste,
  name,
  pattern,
  patternId,
  setPatternId,
  targetWall,
  conversion,
  pasteTransform,
  feature,
  activeWall,
  visual,
  metrics,
  authoring,
  facade,
  elements,
  selected,
  locked,
  targetEdit,
  targetWalls,
  choose,
  commit,
  applyWall,
  updateElements,
  tryAction,
}: Inputs) {
  const stamp = (): Stamp => ({
    elements: structuredClone(elements.filter((e) => selected.includes(e.id))),
    wallLength: metrics!.length,
    name: name.trim() || 'Detail preset',
  });
  const duplicate = () => {
    if (!selected.length || !metrics) return;
    const values = copyElements(
      elements.filter((e) => selected.includes(e.id) && !locked.includes(e.id)),
      metrics.length,
      metrics.length,
      grid,
      0,
    );
    if (!values.length) return;
    if (updateElements([...elements, ...values]))
      setSelected(values.map((e) => e.id));
  };
  const remove = () => {
    const ids = selected.filter((id) => !locked.includes(id));
    updateElements(
      elements.filter((e) => !ids.includes(e.id)),
      authoring,
    );
  };
  const add = (kind: FacadeElementKind) => {
    if (!metrics || before) return;
    tryAction(() => {
      // Insertion and preserving generated details are one undoable command.
      // A preview remains optional; an Add action must not discard its intent.
      const base =
        facade || conversion || editableFacade(feature, activeWall, visual);
      const value: FacadeElement = {
        id: crypto.randomUUID(),
        kind,
        x: 0.5,
        bottom:
          kind === 'text'
            ? Math.max(0, metrics.eaves - 2)
            : kind === 'window'
              ? 1
              : 0,
        ...(kind === 'text'
          ? {
              text: 'Building name',
              textWeight: 'bold' as const,
              textAlign: 'center' as const,
            }
          : {}),
        width:
          kind === 'text'
            ? Math.min(4, metrics.length * 0.8)
            : kind === 'column'
              ? 0.35
              : 1.5,
        height:
          kind === 'text'
            ? 1
            : ['trim', 'canopy', 'parapet'].includes(kind)
              ? 0.2
              : 2,
        depth: ['balcony', 'canopy'].includes(kind) ? 1 : 0.08,
        count: 1,
        spacing: 0,
        colour:
          kind === 'text'
            ? '#172b36'
            : kind === 'window'
              ? '#557585'
              : '#d8cbb1',
      };
      applyWall({ ...base, elements: [...base.elements, value] });
      setSelected([value.id]);
    });
  };
  const editPattern = () =>
    tryAction(() => {
      if (!metrics || !facade) return;
      const existing = authoring.patterns.find((p) => p.id === patternId);
      const seed =
        existing?.seed || elements.filter((e) => selected.includes(e.id));
      if (!seed.length) throw new Error('Select details for the pattern.');
      const replaced = existing?.members || selected;
      const next = {
        id: existing?.id || crypto.randomUUID(),
        name: name.trim() || existing?.name || 'Repeated details',
        wallId: activeWall,
        seed: structuredClone(seed),
        members: [] as string[],
        excluded: existing?.excluded || [],
        ...pattern,
      };
      const generated = regeneratePattern(next, metrics.length),
        values = generated.elements;
      const completed = {
        ...next,
        members: values.map((e) => e.id),
        slots: generated.slots,
      };
      updateElements(
        [...elements.filter((e) => !replaced.includes(e.id)), ...values],
        {
          ...authoring,
          patterns: [
            ...authoring.patterns.filter((p) => p.id !== next.id),
            completed,
          ],
        },
      );
      setPatternId(next.id);
      setSelected(values.map((e) => e.id));
    });
  const confirmPaste = () =>
    tryAction(() => {
      if (!paste || !targetEdit) return;
      const wall =
        targetWalls.find((w) => w.wallId === targetWall) || targetWalls[0];
      if (!wall) throw new Error('Select a target wall.');
      const feature = modelFeature(targetEdit),
        v = data.visuals?.buildings.find((v) => v.id === targetEdit.id),
        m = wallMetrics(feature, wall.wallId, v),
        f = editableFacade(feature, wall.wallId, v);
      const values = copiedPlacement(paste, m.length);
      const errors = placementErrors(
        [...f.elements, ...values],
        m.length,
        m.eaves,
      );
      if (errors.length)
        throw new Error(
          'The copied layout does not fit. Change the target, reposition the source, or explicitly resize it before copying.',
        );
      const next = {
        ...f,
        elements: [...f.elements, ...values],
        reviewedAt: undefined,
        confidence: 'inferred' as const,
        notes:
          `${f.notes}\nCopied design added; review its identity and dimensions on this wall.`.slice(
            0,
            2000,
          ),
      };
      if (!targetEdit.properties.appearance?.facades?.[wall.wallId]) {
        next.photoIds = [];
        next.confidence = 'inferred';
        next.texture = undefined;
      }
      const nextEdit = {
        ...targetEdit,
        properties: {
          ...targetEdit.properties,
          modelAuthoring:
            targetEdit.properties.modelAuthoring || emptyAuthoring(),
          appearance: {
            ...targetEdit.properties.appearance,
            facades: {
              ...targetEdit.properties.appearance?.facades,
              [wall.wallId]: next,
            },
          },
        },
      };
      if (commit(nextEdit)) {
        setPaste(null);
        if (targetEdit.id === edit.id) {
          choose(wall.wallId);
          setSelected(values.map((e) => e.id));
        } else
          setError(
            `Copied to ${targetEdit.properties.name || 'building'} · owner review required.`,
          );
      }
    });
  const copiedPlacement = (stamp: Stamp, length: number) =>
    copyElements(stamp.elements, stamp.wallLength, length).map((e) => ({
      ...e,
      x: e.x * pasteTransform.scale + pasteTransform.x / length,
      bottom: e.bottom * pasteTransform.scale + pasteTransform.y,
      width: e.width * pasteTransform.scale,
      height: e.height * pasteTransform.scale,
      depth: e.depth * pasteTransform.scale,
      spacing: e.spacing * pasteTransform.scale,
    }));
  return {
    stamp,
    duplicate,
    remove,
    add,
    editPattern,
    confirmPaste,
    copiedPlacement,
  };
}
export type ModelDetailCommandsBindings = ReturnType<
  typeof useModelDetailCommands
>;
