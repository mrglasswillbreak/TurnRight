import { validateEdit } from './editor-model';
import { modelFeature, placementErrors, wallMetrics } from './model-authoring';
import { commitDetailInstances } from './model-instances';
import type { MapEdit } from './types';
import type { FacadeDescription, FacadeElement } from './visual-types';

import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Inputs = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'onEdit'
  | 'workspace'
  | 'setLocal'
  | 'before'
  | 'setError'
  | 'wholeRows'
  | 'setWholeRows'
  | 'setPending'
  | 'setPendingAuthoring'
  | 'setConversion'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'walls'
    | 'activeWall'
    | 'visual'
    | 'metrics'
    | 'authoring'
    | 'facade'
    | 'sourceElements'
    | 'elements'
    | 'locked'
  >;
export function useModelCommit({
  edit,
  onEdit,
  workspace,
  setLocal,
  before,
  setError,
  wholeRows,
  setWholeRows,
  setPending,
  setPendingAuthoring,
  setConversion,
  draft,
  feature,
  walls,
  activeWall,
  visual,
  metrics,
  authoring,
  facade,
  sourceElements,
  elements,
  locked,
}: Inputs) {
  const commit = (next: MapEdit, allowReview = false) => {
    if (before) return false;
    if (
      next.id === edit.id &&
      (next.properties.appearance !== draft.properties.appearance ||
        ['height', 'floors', 'heightMode'].some(
          (key) => next.properties[key] !== draft.properties[key],
        ))
    ) {
      const facades = next.properties.appearance?.facades;
      if (facades)
        for (const [id, f] of Object.entries(facades)) {
          if (!walls.some((w) => w.wallId === id)) continue;
          try {
            const old = wallMetrics(feature, id, visual),
              current = wallMetrics(modelFeature(next), id, visual);
            if (
              Math.abs(old.eaves - current.eaves) > 0.001 ||
              Math.abs(old.height - current.height) > 0.001
            ) {
              next = {
                ...next,
                properties: {
                  ...next.properties,
                  appearance: {
                    ...next.properties.appearance,
                    facades: {
                      ...next.properties.appearance?.facades,
                      [id]: { ...f, needsReview: true, reviewedAt: undefined },
                    },
                  },
                },
              };
            }
          } catch {
            /* Validation below reports malformed roof settings. */
          }
        }
    }
    const errors = validateEdit(next);
    if (errors.length && !allowReview) {
      setError(errors.join(' '));
      return false;
    }
    setError(
      errors.length ? `Saved locally for repair: ${errors.join(' ')}` : '',
    );
    if (next.id === edit.id) {
      setLocal(next);
      onEdit(next);
    } else if (workspace) workspace.commit([next]);
    else {
      setError('Open the owner workspace to copy to another building.');
      return false;
    }
    return true;
  };
  const applyWall = (
    next: FacadeDescription,
    metadata = authoring,
    reviewed = false,
  ) => {
    if (!metrics) return false;
    if (before) return false;
    const retain = () => {
      setPending(next);
      setPendingAuthoring(metadata);
      setConversion(null);
      workspace?.recoverModelInput(
        edit.id,
        `pending:${activeWall}`,
        JSON.stringify({ facade: next, authoring: metadata }),
      );
    };
    const errors = placementErrors(
      next.elements,
      metrics.length,
      metrics.eaves,
    );
    if (errors.length) {
      retain();
      setError(
        errors
          .map(
            (e) => `${authoring.names[e.id] || e.id.slice(0, 8)}: ${e.message}`,
          )
          .join(' '),
      );
      return false;
    }
    const value = {
      ...next,
      reviewedAt: reviewed ? new Date().toISOString() : undefined,
    };
    if (
      commit({
        ...draft,
        properties: {
          ...draft.properties,
          modelAuthoring: metadata,
          appearance: {
            ...draft.properties.appearance,
            facades: {
              ...draft.properties.appearance?.facades,
              [activeWall]: value,
            },
          },
        },
      })
    ) {
      setPending(null);
      setPendingAuthoring(null);
      setConversion(null);
      workspace?.recoverModelInput(edit.id, `pending:${activeWall}`);
      return true;
    }
    retain();
    return false;
  };
  const updateElements = (next: FacadeElement[], metadata = authoring) => {
    if (!facade) return false;
    try {
      const result = commitDetailInstances(
        sourceElements,
        next,
        metadata,
        activeWall,
        wholeRows,
        wholeRows.length > 0 && metadata === authoring,
      );
      return applyWall(
        { ...facade, elements: result.elements },
        result.authoring,
      );
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const patch = (id: string, values: Partial<FacadeElement>) => {
    if (locked.includes(id)) return false;
    const saved = updateElements(
      elements.map((e) => (e.id === id ? { ...e, ...values } : e)),
    );
    if (saved && values.count && values.count > 1) setWholeRows([id]);
    return saved;
  };
  const tryAction = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return { commit, applyWall, updateElements, patch, tryAction };
}
export type ModelCommitBindings = ReturnType<typeof useModelCommit>;
