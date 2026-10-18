import { canonical } from './editor-conflicts';
import { featureEdit } from './editor-features';
import { editKey } from './editor-workspace';
import type { MapEdit, Position } from './types';
import type { ValidationIssue } from './validation';

import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'setReviewOverlay'
  | 'setExplorer'
  | 'tool'
  | 'setBuildingSelection'
  | 'setMessage'
  | 'setBusy'
  | 'mapRef'
  | 'controller'
  | 'selectedRef'
  | 'setRepairFocus'
  | 'repairPreview'
  | 'setRepairPreview'
  | 'setRepairErrors'
  | 'base'
  | 'currentBase'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'select' | 'commit'>;
export function useEditorRepair({
  workspace,
  setReviewOverlay,
  setExplorer,
  tool,
  setBuildingSelection,
  setMessage,
  setBusy,
  mapRef,
  controller,
  selectedRef,
  setRepairFocus,
  repairPreview,
  setRepairPreview,
  setRepairErrors,
  base,
  currentBase,
  validation,
  select,
  commit,
}: Inputs) {
  const stageRepair = (
    batch: MapEdit[],
    title = 'Review proposed geometry',
  ) => {
    workspace.endHistoryGroup();
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the drawing before reviewing a repair.');
      return;
    }
    setRepairErrors([]);
    setRepairPreview({
      batch: structuredClone(batch),
      stamp: canonical(workspace.edits),
      base,
      title,
    });
    const before = batch
      .map((e) => featureEdit(validation.data, e.kind, e.id, workspace.edits))
      .filter((e): e is MapEdit => !!e);
    setReviewOverlay([
      ...before.map((e) => ({
        type: 'Feature' as const,
        geometry: e.geometry,
        properties: { color: '#d45555' },
      })),
      ...batch.map((e) => ({
        type: 'Feature' as const,
        geometry: e.geometry,
        properties: { color: '#26a07c' },
      })),
    ]);
    const coordinates: Position[] = [];
    const collect = (value: unknown) => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number')
        coordinates.push([value[0], value[1]]);
      else value.forEach(collect);
    };
    [...before, ...batch].forEach((e) => {
      if ('coordinates' in e.geometry) collect(e.geometry.coordinates);
    });
    if (coordinates.length)
      mapRef.current?.fitBounds(
        [
          [
            Math.min(...coordinates.map((p) => p[0])),
            Math.min(...coordinates.map((p) => p[1])),
          ],
          [
            Math.max(...coordinates.map((p) => p[0])),
            Math.max(...coordinates.map((p) => p[1])),
          ],
        ],
        {
          maxZoom: 20,
          duration: 300,
          padding: {
            top: 80,
            left: 75,
            right: innerWidth < 700 ? 25 : 340,
            bottom:
              innerWidth < 700
                ? Math.round(
                    (mapRef.current?.getContainer().clientHeight ||
                      innerHeight) * 0.64,
                  )
                : 220,
          },
        },
      );
    controller.current?.select(selectedRef.current);
  };
  const dismissRepair = () => {
    setRepairPreview(null);
    setReviewOverlay([]);
    setRepairErrors([]);
    controller.current?.select(selectedRef.current);
  };
  const applyRepair = async () => {
    if (!repairPreview) return;
    if (workspace.unfinished || tool) {
      setRepairErrors([
        'Finish or cancel the drawing before applying a repair.',
      ]);
      return;
    }
    if (
      repairPreview.stamp !== canonical(workspace.edits) ||
      repairPreview.base !== currentBase.current
    ) {
      setRepairErrors([
        'The map changed. Cancel and review this repair again.',
      ]);
      return;
    }
    const original = workspace.edits;
    const batch = repairPreview.batch;
    setBusy(true);
    try {
      const check = await validation.check([
        ...original.filter(
          (e) => !batch.some((b) => editKey(e) === editKey(b)),
        ),
        ...batch,
      ]);
      if (
        workspace.edits !== original ||
        workspace.unfinished ||
        repairPreview.base !== currentBase.current
      )
        throw new Error('The map changed. Review this repair again.');
      const added = check.errors.filter(
        (error) => !validation.errors.includes(error),
      );
      if (!check.usable || added.length) {
        setRepairErrors(added.length ? added : check.errors);
        return;
      }
      commit(batch);
      dismissRepair();
      setRepairFocus(null);
      setMessage('Reviewed repair applied. Undo restores the previous draft.');
    } catch (e) {
      setRepairErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };
  const openIssue = (issue: ValidationIssue) => {
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the drawing before opening a repair.');
      return;
    }
    const edit =
      issue.featureId && issue.featureKind
        ? featureEdit(
            validation.data,
            issue.featureKind,
            issue.featureId,
            workspace.edits,
          )
        : undefined;
    if (edit) {
      select(edit, true);
      setRepairFocus(issue);
      if (issue.repair === 'review-model')
        setBuildingSelection({
          buildingId: edit.id,
          partId:
            edit.properties.appearance?.facades?.[issue.field || '']?.partId,
          wallId: issue.field === 'modelDocument' ? undefined : issue.field,
        });
      setExplorer(false);
    } else if (issue.coordinates)
      mapRef.current?.flyTo({ center: issue.coordinates, zoom: 18 });
    setMessage(
      issue.field === 'modelDocument'
        ? 'Review authored geometry and materials, then mark this model reviewed in Mesh tools.'
        : issue.repair === 'review-model'
          ? 'Review the selected wall’s placement and evidence, then mark only that wall reviewed.'
          : issue.repair === 'choose-place'
            ? 'Choose the place served by this entrance, then review the change.'
            : issue.repair === 'connect-path'
              ? 'Use the connection controls to choose a highlighted path or draw an approach.'
              : 'Inspect the highlighted segment and adjust its geometry. Review the proposed repair before applying it.',
    );
  };
  return { stageRepair, dismissRepair, applyRepair, openIssue };
}
export type EditorRepairBindings = ReturnType<typeof useEditorRepair>;
