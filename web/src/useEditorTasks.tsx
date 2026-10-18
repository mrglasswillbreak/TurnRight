import {
  Building2,
  DoorOpen,
  Flag,
  MapPin,
  MousePointer2,
  Route as RouteIcon,
  Shield,
} from 'lucide-react';
import { useMemo } from 'react';
import { type EditorSection } from './editor-layout';
import { searchKey } from './place-details';
import { placeHasConnection } from './routing';
import type { MapEdit, Position } from './types';

import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSourcesBindings } from './useEditorSources';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'drafts'
  | 'setTaskError'
  | 'failTask'
  | 'setReviewOverlay'
  | 'survey'
  | 'setTab'
  | 'search'
  | 'filter'
  | 'explorer'
  | 'setExplorer'
  | 'setLayersOpen'
  | 'tool'
  | 'setTool'
  | 'setThreeD'
  | 'setError'
  | 'setBusy'
  | 'testOrigin'
  | 'testDest'
  | 'setRoutes'
  | 'showRoutes'
  | 'setShowRoutes'
  | 'mapRef'
  | 'controller'
  | 'routeRequest'
  | 'drawingPanels'
  | 'calculate'
  | 'validation'
> &
  Pick<EditorSourcesBindings, 'invalid'>;
export function useEditorTasks({
  workspace,
  drafts,
  setTaskError,
  failTask,
  setReviewOverlay,
  survey,
  setTab,
  search,
  filter,
  explorer,
  setExplorer,
  setLayersOpen,
  tool,
  setTool,
  setThreeD,
  setError,
  setBusy,
  testOrigin,
  testDest,
  setRoutes,
  showRoutes,
  setShowRoutes,
  mapRef,
  controller,
  routeRequest,
  drawingPanels,
  calculate,
  validation,
  invalid,
}: Inputs) {
  const previewTestRoute = async () => {
    const request = ++routeRequest.current;
    setBusy(true);
    try {
      const found = await calculate(
        validation.data,
        { placeId: testOrigin },
        { placeId: testDest },
      );
      if (request === routeRequest.current) {
        setRoutes(found);
        setTaskError(null);
        const points = found[0].coordinates;
        mapRef.current?.fitBounds(
          [
            [
              Math.min(...points.map((p) => p[0])),
              Math.min(...points.map((p) => p[1])),
            ],
            [
              Math.max(...points.map((p) => p[0])),
              Math.max(...points.map((p) => p[1])),
            ],
          ],
          {
            maxZoom: 19,
            padding: {
              left: innerWidth > 1000 ? 365 : 70,
              right: innerWidth > 1000 ? 330 : 40,
              top: 100,
              bottom: 165,
            },
          },
        );
      }
    } catch (e) {
      if (request === routeRequest.current)
        failTask(e, 'Retry route', previewTestRoute);
    } finally {
      setBusy(false);
    }
  };
  const tasks = useMemo(() => {
    const result: {
      id: string;
      kind: MapEdit['kind'];
      name: string;
      reason: string;
    }[] = [];
    for (const place of validation.data.places)
      result.push({
        id: place.id,
        kind: 'place',
        name: place.name,
        reason: !placeHasConnection(validation.data, place)
          ? 'Missing walking connection'
          : !(validation.data.entrances || []).some(
                (e) => e.placeId === place.id,
              )
            ? 'Needs an entrance'
            : 'Mapped place',
      });
    for (const f of validation.data.map.features)
      if (['building', 'path', 'land', 'overlay'].includes(f.properties?.kind))
        result.push({
          id: String(f.properties!.id),
          kind: f.properties!.kind,
          name: String(
            f.properties!.name ||
              (f.properties!.kind === 'building'
                ? 'Unnamed building'
                : 'Campus path'),
          ),
          reason:
            f.properties!.kind === 'building' && !Number(f.properties!.height)
              ? 'Height unknown'
              : 'Mapped geometry',
        });
    for (const edit of workspace.edits.filter((e) => !e.deleted))
      if (
        validation.issues.some(
          (i) =>
            i.featureId === edit.id &&
            (!i.featureKind || i.featureKind === edit.kind),
        )
      )
        result.unshift({
          id: edit.id,
          kind: edit.kind,
          name: String(edit.properties.name),
          reason: invalid.has(edit.id) ? 'Needs repair' : 'Review connection',
        });
    for (const edit of drafts)
      if (
        !result.some((task) => task.id === edit.id && task.kind === edit.kind)
      )
        result.push({
          id: edit.id,
          kind: edit.kind,
          name: String(edit.properties.name || edit.id),
          reason: edit.deleted
            ? 'Removed in this draft'
            : 'Unpublished correction',
        });
    const grouped = new Map<string, (typeof result)[number]>();
    for (const task of result) {
      const key = `${task.kind}:${task.id}`,
        previous = grouped.get(key);
      const reasons = validation.issues
        .filter(
          (issue) =>
            issue.featureId === task.id &&
            (!issue.featureKind || issue.featureKind === task.kind),
        )
        .map((issue) => issue.message);
      const combined = [
        ...new Set([
          ...(previous ? previous.reason.split(' · ') : []),
          task.reason,
          ...reasons,
        ]),
      ];
      grouped.set(key, { ...task, reason: combined.join(' · ') });
    }
    return [...grouped.values()];
  }, [validation, workspace.edits, drafts, invalid]);
  const featureQuery = searchKey(search);
  const visibleTasks = tasks.filter(
    (t) =>
      searchKey(`${t.name} ${t.reason}`).includes(featureQuery) &&
      (filter === 'all' ||
        (filter === 'needs' &&
          (!t.reason.startsWith('Mapped') || t.reason.includes(' · '))) ||
        (filter === 'drafts' &&
          drafts.some((e) => e.id === t.id && e.kind === t.kind))),
  );
  const toolButtons = [
    { kind: null, name: 'Select', icon: MousePointer2, shortcut: '' },
    { kind: 'entrance', name: 'Add entrance', icon: DoorOpen, shortcut: 'E' },
    { kind: 'path', name: 'Draw path', icon: RouteIcon, shortcut: 'P' },
    { kind: 'place', name: 'Add place', icon: MapPin, shortcut: 'M' },
    { kind: 'building', name: 'Draw building', icon: Building2, shortcut: 'B' },
    { kind: 'closure', name: 'Add closure', icon: Flag, shortcut: '' },
    { kind: 'barrier', name: 'Draw barrier', icon: Shield, shortcut: '' },
  ] as const;
  const toggleView = (value: boolean) => {
    setThreeD(value);
    try {
      localStorage.setItem('turnright:editor-view', value ? '3d' : '2d');
    } catch {
      /* View still works this session. */
    }
  };
  const resume = () => {
    const drawing = workspace.unfinished;
    if (!drawing) return;
    drawingPanels.current = { explorer, routes: showRoutes };
    setExplorer(false);
    setShowRoutes(false);
    const points =
      drawing.geometry.type === 'LineString'
        ? drawing.geometry.coordinates
        : drawing.geometry.type === 'Polygon'
          ? drawing.geometry.coordinates[0]
          : [];
    setTool(drawing.kind);
    controller.current?.begin(
      drawing.kind,
      drawing.properties,
      points as Position[],
      drawing.id,
    );
  };
  const selectSection = (id: EditorSection) => {
    document
      .querySelectorAll<HTMLDetailsElement>('details.workspace-menu[open]')
      .forEach((menu) => {
        menu.open = false;
      });
    workspace.endHistoryGroup();
    if (survey) {
      setError('Close the survey before changing workspace.');
      return;
    }
    if (
      id !== 'settings' &&
      (!!tool || !!workspace.unfinished || !!workspace.roofDraft)
    ) {
      setError('Finish or cancel the current edit before changing workspace.');
      return;
    }
    setLayersOpen(id === 'layers');
    if (id === 'layers') {
      setExplorer(false);
      setTab('map');
      return;
    }
    setReviewOverlay([]);
    setTab(id);
    setExplorer(id === 'map');
  };
  return {
    previewTestRoute,
    visibleTasks,
    toolButtons,
    toggleView,
    resume,
    selectSection,
  };
}
export type EditorTasksBindings = ReturnType<typeof useEditorTasks>;
