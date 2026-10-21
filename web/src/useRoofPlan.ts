/* The roof SVG supports spatial gestures; point lists and numeric fields provide equivalent keyboard controls. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useRoofText } from './use-roof-text';
import { useModelSurface } from './model-surface';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapEdit, Position } from './types';
import type {
  BuildingTopology,
  CustomRoof,
  RoofDraft,
  RoofPoint,
} from './visual-types';
import { customRoofSurface, type RoofSurface } from './custom-roof';
import { buildingDisplay } from './map-display';
import { buildingTopology } from './building-surfaces';
import {
  useModelMobile,
  useModelPlanNavigation,
  useModelSvgUnits,
} from './model-mobile';

export type RoofPlanProps = {
  edit: MapEdit;
  partId: string;
  polygon: number[][][];
  topology: BuildingTopology['parts'][number];
  height: number;
  illustrative?: boolean;
  draft: RoofDraft | null;
  onDraft: (value: RoofDraft | null) => void;
  onApply: (edit: MapEdit) => void;
  onSurface: (index: number | undefined) => void;
  focusedSurface?: number;
  focusedText?: string;
  onTextSelect: (id?: string) => void;
  autoSave?: boolean;
  workspace?: import('./editor-workspace').EditorWorkspace;
};
export function useRoofPlan({
  edit,
  partId,
  polygon,
  topology,
  height,
  illustrative,
  draft,
  onDraft,
  onApply,
  onSurface,
  focusedSurface,
  focusedText,
  onTextSelect,
  autoSave = false,
  workspace,
}: RoofPlanProps) {
  const mobile = useModelMobile();

  const [tool, setTool] = useState<'select' | 'point' | 'ridge' | 'valley'>(
    'select',
  );

  const [proposalError, setProposalError] = useState('');

  useEffect(() => {
    if (mobile.compact && mobile.tool === 'move') setTool('select');
  }, [mobile.compact, mobile.tool]);

  const [selected, setSelected] = useState(''),
    [from, setFrom] = useState(''),
    [surface, setSurface] = useState<number | null>(null);

  useEffect(() => setSurface(focusedSurface ?? null), [focusedSurface]);

  const svg = useRef<SVGSVGElement>(null),
    dragging = useRef<string | null>(null),
    lastValid = useRef<RoofSurface | null>(null);

  const latestRoof = useRef<CustomRoof | null>(null);

  const gestureRoof = useRef<CustomRoof | null>(null);

  const editButton = useRef<HTMLButtonElement>(null),
    selectTool = useRef<HTMLButtonElement>(null),
    hadDraft = useRef(!!draft);

  const hasDraft = !!draft;

  useEffect(() => {
    if (hadDraft.current !== hasDraft)
      (hasDraft ? selectTool.current : editButton.current)?.focus();
    hadDraft.current = hasDraft;
  }, [hasDraft]);

  const existing = edit.properties.appearance?.roofs?.[partId];

  const roof = useMemo(
    () =>
      draft?.roof ||
      existing || {
        eaves: Math.max(0.1, height - Math.min(1.8, height * 0.18)),
        points: [],
        lines: [],
      },
    [draft?.roof, existing, height],
  );

  const result = useMemo(() => {
    try {
      return { generated: customRoofSurface(polygon, roof, height), error: '' };
    } catch (e) {
      return { generated: null, error: (e as Error).message };
    }
  }, [polygon, roof, height]);

  const generated = result.generated;

  let error = result.error;

  if (generated) lastValid.current = generated;

  if (draft && draft.geometryRevision !== JSON.stringify(edit.geometry))
    error =
      'The wing outline changed. Cancel this roof draft and reopen it against the current outline.';

  const shown = generated || lastValid.current;

  const points = polygon.flat(),
    west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0])),
    south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));

  const sx = Math.cos((((south + north) / 2) * Math.PI) / 180),
    span = Math.max((east - west) * sx, north - south, 0.000001),
    scale = 260 / span;

  const project = (p: number[]) => [
    20 + (p[0] - west) * sx * scale,
    280 - (p[1] - south) * scale,
  ];

  const unproject = (x: number, y: number): Position => [
    west + (x - 20) / scale / sx,
    south + (280 - y) / scale,
  ];

  const update = (next: CustomRoof, continuous = false) => {
    latestRoof.current = next;
    onDraft({
      buildingId: edit.id,
      partId,
      geometryRevision: JSON.stringify(edit.geometry),
      roof: next,
    });
    if (autoSave && !continuous && !dragging.current) apply(next);
  };

  const start = () => update(structuredClone(roof));

  const location = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return unproject(p.x, p.y);
  };

  const snap = (
    coordinates: Position,
  ): Pick<RoofPoint, 'coordinates' | 'vertexId'> => {
    const xy = project(coordinates);
    for (let r = 0; r < polygon.length; r++)
      for (let v = 0; v < polygon[r].length - 1; v++) {
        const q = project(polygon[r][v]);
        if (Math.hypot(xy[0] - q[0], xy[1] - q[1]) < 9)
          return {
            coordinates: polygon[r][v] as Position,
            vertexId: topology.rings[r].vertexIds[v],
          };
      }
    return { coordinates };
  };

  const pick = (id: string, current = roof) => {
    setSelected(id);
    setSurface(null);
    onSurface(undefined);
    if (tool === 'ridge' || tool === 'valley') {
      if (from && from !== id && current.points.some((p) => p.id === from)) {
        update({
          ...current,
          lines: [
            ...current.lines,
            { id: crypto.randomUUID(), from, to: id, kind: tool },
          ],
        });
        setFrom('');
      } else setFrom(id);
    }
  };

  const add = (coordinates: Position) => {
    const near = roof.points.find(
      (p) =>
        Math.hypot(
          ...project(p.coordinates).map((v, i) => v - project(coordinates)[i]),
        ) < 9,
    );
    if (near) {
      pick(near.id);
      return;
    }
    const attached = snap(coordinates),
      point: RoofPoint = {
        id: crypto.randomUUID(),
        ...attached,
        elevation: attached.vertexId ? roof.eaves : height,
      };
    const next = { ...roof, points: [...roof.points, point] };
    update(next);
    pick(point.id, next);
  };

  const active = roof.points.find((p) => p.id === selected);

  const textTools = useRoofText({
    edit,
    partId,
    roof: shown,
    project,
    unproject,
    svg,
    workspace,
    onApply,
    selectedId: focusedText,
    onSelect: onTextSelect,
  });

  const cancel = () => {
    textTools.cancel();
    dragging.current = null;
    if (gestureRoof.current) update(gestureRoof.current, true);
    latestRoof.current = null;
    gestureRoof.current = null;
  };

  const navigation = useModelPlanNavigation(
    [0, 0, 300, 300],
    cancel,
    (target) =>
      mobile.tool === 'move' &&
      !!target.closest('[data-roof-point], [data-roof-text]'),
  );

  const [handleUnit] = useModelSvgUnits(svg, navigation.viewBox + hasDraft);

  const cancelRef = useRef(cancel);

  cancelRef.current = cancel;

  useEffect(() => {
    cancelRef.current();
  }, [tool]);

  const patch = (value: Partial<RoofPoint>) =>
    update({
      ...roof,
      points: roof.points.map((p) =>
        p.id === selected ? { ...p, ...value } : p,
      ),
    });

  const apply = (candidate = roof) => {
    if (!draft && !autoSave) return;
    try {
      customRoofSurface(polygon, candidate, height);
    } catch {
      return;
    }
    const appearance = structuredClone(edit.properties.appearance || {});
    (appearance.roofs ||= {})[partId] = structuredClone(candidate);
    if (
      !appearance.parts?.[partId]?.heightMode &&
      !appearance.parts?.[partId]?.height &&
      height !== buildingDisplay(edit.properties).metres
    ) {
      (appearance.parts ||= {})[partId] = {
        ...appearance.parts?.[partId],
        height,
        heightMode: 'metres',
        confidence: 'inferred',
        provenance:
          'Total wing height adopted from the current visual reference when applying this roof.',
      };
    }
    onApply({
      ...edit,
      properties: {
        ...edit.properties,
        appearance,
        buildingTopology: buildingTopology({
          type: 'Feature',
          geometry: edit.geometry,
          properties: { ...edit.properties, id: edit.id },
        }),
      },
    });
  };

  useModelSurface(
    svg,
    partId,
    'roof',
    (x, y) => [...unproject(x, y), roof.eaves],
    navigation.viewBox + JSON.stringify([west, south, scale, roof.eaves]),
    cancel,
    textTools.preview
      ? { edit: textTools.preview }
      : draft
        ? { roof: draft }
        : null,
  );
  return {
    height,
    illustrative,
    textTools,
    draft,
    editButton,
    start,
    existing,
    update,
    polygon,
    setProposalError,
    proposalError,
    edit,
    partId,
    onApply,
    selectTool,
    tool,
    setTool,
    setFrom,
    mobile,
    from,
    autoSave,
    roof,
    workspace,
    navigation,
    svg,
    dragging,
    gestureRoof,
    latestRoof,
    location,
    add,
    snap,
    apply,
    project,
    shown,
    surface,
    setSurface,
    onSurface,
    setSelected,
    handleUnit,
    selected,
    pick,
    active,
    error,
    west,
    east,
    south,
    north,
    patch,
    onDraft,
  };
}
export type RoofPlanState = ReturnType<typeof useRoofPlan>;
