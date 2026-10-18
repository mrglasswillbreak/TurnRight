import { useCallback, useMemo, useState } from 'react';
import { layerPresentation } from './campus-layers';
import { duplicateDecision, type DuplicateCandidate } from './duplicates';
import { editKey } from './editor-workspace';
import type { MapEdit } from './types';

import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'layerView'
  | 'selected'
  | 'setSelected'
  | 'tool'
  | 'preview'
  | 'setMessage'
  | 'setError'
  | 'setBusy'
  | 'setRoutes'
  | 'controller'
  | 'selectedRef'
  | 'base'
  | 'validation'
>;
export function useEditorSources({
  workspace,
  layerView,
  selected,
  setSelected,
  tool,
  preview,
  setMessage,
  setError,
  setBusy,
  setRoutes,
  controller,
  selectedRef,
  base,
  validation,
}: Inputs) {
  const mergeBatch = useCallback(
    async (batch: MapEdit[], success: string) => {
      if (!batch.length || tool || workspace.unfinished || validation.pending)
        return;
      setBusy(true);
      const original = workspace.edits;
      try {
        const next = [
          ...original.filter(
            (e) => !batch.some((b) => editKey(b) === editKey(e)),
          ),
          ...batch,
        ];
        const checked = await validation.check(next);
        if (workspace.edits !== original)
          throw new Error('The draft changed. Review this pair again.');
        const newErrors = checked.errors.filter(
          (e) => !validation.errors.includes(e),
        );
        if (newErrors.length) throw new Error(newErrors.join(' '));
        workspace.commit(batch, null);
        setSelected(null);
        selectedRef.current = null;
        controller.current?.select(null);
        setRoutes([]);
        setMessage(success);
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [
      tool,
      workspace,
      validation,
      setBusy,
      setRoutes,
      setSelected,
      setError,
      selectedRef,
      setMessage,
      controller,
    ],
  );
  const decideDuplicate = async (
    candidate: DuplicateCandidate,
    survivor?: string,
  ) => {
    try {
      await mergeBatch(
        duplicateDecision(
          validation.data,
          workspace.edits,
          candidate,
          survivor,
        ),
        survivor
          ? 'Records merged. Saved place references and entrances now use the survivor. Undo restores both.'
          : 'Records kept separate. This decision is retained through source refreshes.',
      );
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const [appearancePreview, setAppearancePreview] = useState<MapEdit[] | null>(
    null,
  );
  const visible = preview && validation.usable ? base : validation.data;
  const selectionForMap =
    selected &&
    (() => {
      const {
        photos: _photos,
        arrival: _arrival,
        ...properties
      } = selected.properties;
      return {
        id: selected.id,
        kind: selected.kind,
        deleted: selected.deleted,
        geometry: selected.geometry,
        properties,
      };
    })();
  const selectionSignature = JSON.stringify(selectionForMap);
  // Photographs and guides do not affect map geometry or building models.
  const mapSelection = useMemo(
    () => JSON.parse(selectionSignature) as MapEdit | null,
    [selectionSignature],
  );
  const renderedMap = useMemo(() => {
    if (preview || mapSelection?.kind !== 'building' || mapSelection.deleted)
      return visible.map;
    const properties = {
      ...mapSelection.properties,
      id: mapSelection.id,
      kind: 'building',
    };
    const roof = workspace.roofDraft;
    if (roof?.buildingId === mapSelection.id)
      properties.appearance = {
        ...properties.appearance,
        roofs: { ...properties.appearance?.roofs, [roof.partId]: roof.roof },
      };
    const feature = {
      type: 'Feature' as const,
      geometry: mapSelection.geometry,
      properties,
    };
    return {
      ...visible.map,
      features: [
        ...visible.map.features.filter(
          (f) =>
            !(
              f.properties?.kind === 'building' &&
              f.properties.id === mapSelection.id
            ),
        ),
        feature,
      ],
    };
  }, [visible.map, mapSelection, preview, workspace.roofDraft]);
  const rendered = useMemo(() => {
    const appearances = new Map(
      !preview
        ? appearancePreview?.map((edit) => [
            edit.id,
            edit.properties.appearance,
          ])
        : [],
    );
    const map = appearances.size
      ? {
          ...renderedMap,
          features: renderedMap.features.map((feature) => {
            const properties = feature.properties;
            return properties?.kind === 'building' &&
              appearances.has(properties.id)
              ? {
                  ...feature,
                  properties: {
                    ...properties,
                    appearance: appearances.get(properties.id),
                  },
                }
              : feature;
          }),
        }
      : renderedMap;
    return layerPresentation({ ...visible, map }, !preview, layerView);
  }, [visible, renderedMap, preview, layerView, appearancePreview]);
  const invalid = useMemo(
    () =>
      new Set(
        validation.issues
          .filter((i) => i.severity !== 'warning' && i.featureId)
          .map((i) => i.featureId!),
      ),
    [validation.issues],
  );
  return {
    mergeBatch,
    decideDuplicate,
    setAppearancePreview,
    rendered,
    invalid,
  };
}
export type EditorSourcesBindings = ReturnType<typeof useEditorSources>;
