import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { CampusData, MapEdit } from './types';
import type {
  BuildingSelection,
  FacadeDescription,
  FacadeElement,
  FacadeElementKind,
  ModelAuthoring,
  RoofDraft,
} from './visual-types';
import type { EditorWorkspace } from './editor-workspace';
import { facadeErrors, facadeMatches, facadeWalls } from './building-facades';
import { buildingTopology } from './building-surfaces';
import { validateEdit } from './editor-model';
import { PhotoModelPreview } from './PhotoModelPreview';
import { ModelWallCanvas, type WallView } from './ModelWallCanvas';
import { ModelOutlineCanvas } from './ModelOutlineCanvas';
import { ModelField } from './ModelField';
import { ModelPhotoPanel } from './ModelPhotoPanel';
import { BuildingAppearanceEditor } from './BuildingAppearanceEditor';
import {
  ModelMobileContext,
  useCompactModel,
  type ModelPanel,
  type ModelTouchTool,
} from './model-mobile';
import {
  copyElements,
  detachInstance,
  editableFacade,
  elementBounds,
  emptyAuthoring,
  layoutElements,
  modelFeature,
  patternSlots,
  regeneratePattern,
  reconcilePatternEdit,
  placementErrors,
  wallLength,
  wallMetrics,
} from './model-authoring';
import './photo-model.css';

type Mode = 'details' | 'appearance' | 'roof' | 'outline' | 'review';
const kinds: FacadeElementKind[] = [
  'window',
  'door',
  'column',
  'balcony',
  'canopy',
  'parapet',
  'trim',
];
type Stamp = { elements: FacadeElement[]; wallLength: number; name: string };
const emptyElements: FacadeElement[] = [];

type WorkspaceProps = {
  edit: MapEdit;
  data: CampusData;
  selection?: BuildingSelection;
  onSelection: (s: BuildingSelection) => void;
  onEdit: (e: MapEdit) => void;
  onClose: () => void;
  workspace?: EditorWorkspace;
  onHistory?: (redo?: boolean) => void;
  initialMode?: Mode;
};

export default function PhotoModelWorkspace(props: WorkspaceProps) {
  const draft =
    props.workspace?.edits.find(
      (e) => e.kind === 'building' && e.id === props.edit.id && !e.deleted,
    ) || props.edit;
  const facades = draft.properties.appearance?.facades || {};
  const incomplete = Object.entries(facades).filter(
    ([id, f]) =>
      !f ||
      f.wallId !== id ||
      typeof f.partId !== 'string' ||
      !Array.isArray(f.photoIds) ||
      !Array.isArray(f.elements) ||
      !Array.isArray(f.wallCoordinates) ||
      typeof f.notes !== 'string',
  );
  if (!incomplete.length) return <ModelWorkspace {...props} />;
  const walls = facadeWalls(modelFeature(draft));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="photo-model-workspace">
        <DialogTitle>
          Repair wall records · {String(draft.properties.name || 'Building')}
        </DialogTitle>
        <DialogDescription>
          An incomplete recovered wall record cannot be opened safely. Your
          draft is preserved. Empty records contain no details, evidence or
          textures; removing one is undoable.
        </DialogDescription>
        {incomplete.map(([id, value]) => (
          <section key={id}>
            <h3>{walls.find((w) => w.wallId === id)?.label || id}</h3>
            {value && Object.keys(value).length === 0 ? (
              <button
                onClick={() => {
                  const next = { ...facades };
                  delete next[id];
                  props.onEdit({
                    ...draft,
                    properties: {
                      ...draft.properties,
                      appearance: {
                        ...draft.properties.appearance,
                        facades: next,
                      },
                    },
                  });
                }}
              >
                Remove empty wall record
              </button>
            ) : (
              <p>
                This record contains incomplete data. Close the workspace and
                download local recovery before repairing it. Its contents have
                not been discarded.
              </p>
            )}
          </section>
        ))}
        <button onClick={props.onClose}>Close workspace</button>
      </DialogContent>
    </Dialog>
  );
}

function ModelWorkspace({
  edit,
  data,
  selection,
  onSelection,
  onEdit,
  onClose,
  workspace,
  onHistory,
  initialMode = 'details',
}: WorkspaceProps) {
  const compact = useCompactModel();
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionFocus = useRef<string | null>(null);
  const contextReturn = useRef<HTMLElement | null>(null);
  const [contextPoint, setContextPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [panel, setPanel] = useState<ModelPanel>(
      initialMode === 'details' ? 'none' : 'mode',
    ),
    [detent, setDetent] = useState<'half' | 'full'>('half'),
    [touchTool, setTouchTool] = useState<ModelTouchTool>('select'),
    [planHost, setPlanHost] = useState<HTMLDivElement | null>(null);
  const shell = useRef<HTMLDivElement>(null),
    sheetStart = useRef(0),
    sheetDragged = useRef(false),
    sheetReturn = useRef<HTMLElement | null>(null);
  const openPanel = (next: ModelPanel) => {
    if (next !== 'none')
      sheetReturn.current = document.activeElement as HTMLElement;
    setPanel(next);
    setDetent('half');
    setTouchTool('select');
    if (next === 'none') sheetReturn.current?.focus();
  };
  useEffect(() => {
    if (!compact) return;
    const viewport = window.visualViewport;
    const resize = () => {
      shell.current?.style.setProperty(
        '--model-viewport-height',
        `${viewport?.height || innerHeight}px`,
      );
      shell.current?.style.setProperty(
        '--model-viewport-top',
        `${viewport?.offsetTop || 0}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [compact]);
  useEffect(() => {
    if (compact && panel !== 'none')
      requestAnimationFrame(() =>
        shell.current
          ?.querySelector<HTMLButtonElement>('.model-sheet-handle')
          ?.focus(),
      );
  }, [compact, panel]);
  const initial = useRef(edit),
    returnFocus = useRef(document.activeElement as HTMLElement | null);
  const wallViews = useRef(new Map<string, WallView>());
  const [local, setLocal] = useState(edit),
    [mode, setMode] = useState<Mode>(initialMode),
    [wallId, setWallId] = useState(selection?.wallId || ''),
    [selected, setSelected] = useState<string[]>([]),
    [instance, setInstance] = useState(0);
  const [tab, setTab] = useState(
      initialMode === 'appearance' || initialMode === 'review' ? '3d' : 'wall',
    ),
    [before, setBefore] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [grid, setGrid] = useState(0.1);
  const [hidden, setHidden] = useState<string[]>([]),
    [locked, setLocked] = useState<string[]>([]),
    [clipboard, setClipboard] = useState<Stamp | null>(null),
    [paste, setPaste] = useState<Stamp | null>(null),
    [pending, setPending] = useState<FacadeDescription | null>(null);
  const [pendingAuthoring, setPendingAuthoring] =
    useState<ModelAuthoring | null>(null);
  const [name, setName] = useState(''),
    [pattern, setPattern] = useState({
      rows: 1,
      columns: 3,
      stepX: 3,
      stepY: 3,
    }),
    [patternId, setPatternId] = useState(''),
    [targetBuilding, setTargetBuilding] = useState(edit.id),
    [targetWall, setTargetWall] = useState('');
  const [roofDraft, setRoofDraft] = useState<RoofDraft | null>(
      workspace?.roofDraft || null,
    ),
    [reference, setReference] = useState(true),
    [photoId, setPhotoId] = useState('');
  const [conversion, setConversion] = useState<FacadeDescription | null>(null);
  const [pasteTransform, setPasteTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  useEffect(() => setPasteTransform({ x: 0, y: 0, scale: 1 }), [paste]);
  useEffect(() => () => returnFocus.current?.focus(), []);
  useEffect(() => setLocal(edit), [edit]);
  const stored = workspace?.edits.find(
    (e) => e.kind === 'building' && e.id === edit.id,
  );
  const draft = stored && !stored.deleted ? stored : local;
  const feature = useMemo(() => modelFeature(draft), [draft]),
    original = useMemo(() => modelFeature(initial.current), []);
  const walls = useMemo(() => facadeWalls(feature), [feature]);
  const activeWall =
    wallId && walls.some((w) => w.wallId === wallId)
      ? wallId
      : walls[0]?.wallId || '';
  const visual = data.visuals?.buildings.find((v) => v.id === edit.id);
  const metrics = useMemo(
    () => (activeWall ? wallMetrics(feature, activeWall, visual) : null),
    [feature, activeWall, visual],
  );
  const authoring =
    (pending?.wallId === activeWall && pendingAuthoring) ||
    draft.properties.modelAuthoring ||
    emptyAuthoring();
  const recorded = draft.properties.appearance?.facades?.[activeWall];
  const facade = pending?.wallId === activeWall ? pending : recorded;
  const elements = facade?.elements || conversion?.elements || emptyElements;
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => elements.some((e) => e.id === id));
      return next.length === current.length ? current : next;
    });
  }, [elements]);
  const active = elements.find((e) => e.id === selected[0]);
  const photos = useMemo(
    () => (data.photos || []).filter((p) => p.buildingId === edit.id),
    [data.photos, edit.id],
  );
  const photo = photos.find((p) => p.id === photoId) || photos[0];
  const buildings = useMemo(
    () =>
      data.map.features
        .filter((f) => f.properties?.kind === 'building')
        .map((f) => ({
          id: String(f.properties!.id),
          name: String(f.properties!.name || 'Unnamed building'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.map],
  );
  const targetEdit =
    targetBuilding === edit.id
      ? draft
      : workspace?.edits.find(
          (e) => e.id === targetBuilding && e.kind === 'building',
        ) ||
        (() => {
          const f = data.map.features.find(
            (f) =>
              f.properties?.id === targetBuilding &&
              f.properties.kind === 'building',
          );
          return f
            ? {
                id: targetBuilding,
                kind: 'building' as const,
                geometry: f.geometry,
                properties: f.properties!,
              }
            : undefined;
        })();
  const targetWalls = targetEdit ? facadeWalls(modelFeature(targetEdit)) : [];
  const state =
    workspace?.status === 'Saved'
      ? 'Saved to map draft'
      : workspace?.status || 'Saved locally';
  const unsaved =
    !!pending ||
    !!workspace?.roofDraft ||
    Object.keys(workspace?.modelInputs[edit.id] || {}).length > 0;
  const discardInput = () => {
    setPending(null);
    setRoofDraft(null);
    workspace?.draftRoof(null);
    for (const key of Object.keys(workspace?.modelInputs[edit.id] || {}))
      workspace?.recoverModelInput(edit.id, key);
    setError('Unfinished input discarded; saved draft changes remain.');
  };
  const publishErrors = useMemo(
    () => [
      ...new Set([
        ...validateEdit(draft),
        ...facadeErrors(feature, data.photos, true),
      ]),
    ],
    [draft, feature, data.photos],
  );
  const label = (e: FacadeElement) =>
    authoring.names[e.id] ||
    `${e.kind[0].toUpperCase() + e.kind.slice(1)}${e.count > 1 ? ` ×${e.count}` : ''}`;
  const choose = (id: string, elementId?: string, at = 0) => {
    setTouchTool('select');
    setWallId(id);
    setSelected(elementId ? [elementId] : []);
    setInstance(at);
    setPatternId('');
    setPending(null);
    setConversion(null);
    setError('');
    const w = walls.find((w) => w.wallId === id);
    if (w)
      onSelection({
        buildingId: edit.id,
        partId: w.partId,
        wallId: id,
        elementId,
        instanceIndex: at,
      });
  };
  useEffect(() => {
    const saved = workspace?.modelInputs[edit.id]?.[`pending:${activeWall}`];
    if (saved)
      try {
        const recovered = JSON.parse(saved);
        setPending(recovered.facade || recovered);
        setPendingAuthoring(recovered.authoring || null);
      } catch {
        setError(
          'An unfinished wall could not be restored. Discard its recovery entry to continue.',
        );
      }
  }, [activeWall, edit.id, workspace?.modelInputs]);
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
      const result =
        metadata === authoring
          ? reconcilePatternEdit(metadata, activeWall, elements, next)
          : { elements: next, authoring: metadata };
      return applyWall(
        { ...facade, elements: result.elements },
        result.authoring,
      );
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const patch = (id: string, values: Partial<FacadeElement>) =>
    updateElements(
      elements.map((e) => (e.id === id ? { ...e, ...values } : e)),
    );
  const tryAction = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const stamp = (): Stamp => ({
    elements: structuredClone(elements.filter((e) => selected.includes(e.id))),
    wallLength: metrics!.length,
    name: name.trim() || 'Detail preset',
  });
  const duplicate = () => {
    if (!selected.length || !metrics) return;
    const values = copyElements(
      elements.filter((e) => selected.includes(e.id)),
      metrics.length,
      metrics.length,
      grid,
      0,
    );
    updateElements([...elements, ...values]);
    setSelected(values.map((e) => e.id));
  };
  const remove = () => {
    const ids = selected.filter((id) => !locked.includes(id));
    const metadata = {
      ...authoring,
      groups: authoring.groups
        .map((g) => ({
          ...g,
          members: g.members.filter((id) => !ids.includes(id)),
        }))
        .filter((g) => g.members.length),
      patterns: authoring.patterns.filter(
        (p) => !p.members.some((id) => ids.includes(id)),
      ),
    };
    if (
      updateElements(
        elements.filter((e) => !ids.includes(e.id)),
        metadata,
      )
    )
      setSelected([]);
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
        bottom: kind === 'window' ? 1 : 0,
        width: kind === 'column' ? 0.35 : 1.5,
        height: ['trim', 'canopy', 'parapet'].includes(kind) ? 0.2 : 2,
        depth: ['balcony', 'canopy'].includes(kind) ? 1 : 0.08,
        count: 1,
        spacing: 0,
        colour: kind === 'window' ? '#557585' : '#d8cbb1',
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
    setTab(next === 'appearance' || next === 'review' ? '3d' : 'wall');
    openPanel(next === 'details' ? 'none' : 'mode');
  };
  const mobilePanel = paste ? 'copy' : panel;
  const selectionActions = (
    <Menu.Trigger
      className="model-selection-menu-trigger"
      aria-label="Selected detail actions"
      onClick={() => setContextPoint(null)}
    >
      ⋯
    </Menu.Trigger>
  );
  const showContextActions = (x: number, y: number) => {
    actionFocus.current = null;
    contextReturn.current = document.activeElement as HTMLElement | null;
    setContextPoint({ x, y });
    setActionMenuOpen(true);
  };
  const actions = [
    {
      name: 'Edit details',
      shortcut: 'Enter',
      disabled: !selected.length,
      run: () => {
        actionFocus.current = compact
          ? '.model-sheet-handle'
          : '[aria-label="Detail name"]';
        if (compact) openPanel('edit');
        else
          shell.current
            ?.querySelector<HTMLInputElement>('[aria-label="Detail name"]')
            ?.focus();
      },
    },
    {
      name: 'Duplicate',
      shortcut: 'Ctrl+D',
      disabled: before || !selected.length,
      run: duplicate,
    },
    {
      name: 'Copy',
      shortcut: 'Ctrl+C',
      disabled: !selected.length,
      run: () => setClipboard(stamp()),
    },
    {
      name: 'Paste / copy to…',
      shortcut: 'Ctrl+V',
      disabled: before || !clipboard,
      run: () => {
        actionFocus.current = '[aria-label="Target building"]';
        setPaste(clipboard);
        setTargetWall(activeWall);
      },
    },
    {
      name: selected.every((id) => locked.includes(id)) ? 'Unlock' : 'Lock',
      disabled: !selected.length,
      run: () => setLocked(toggle(locked, selected)),
    },
    {
      name: selected.every((id) => hidden.includes(id))
        ? 'Show in editor'
        : 'Hide in editor',
      disabled: !selected.length,
      run: () => setHidden(toggle(hidden, selected)),
    },
    {
      name: 'Select all details',
      shortcut: 'Ctrl+A',
      disabled: !elements.length,
      run: () => setSelected(elements.map((e) => e.id)),
    },
    {
      name: 'Clear selection',
      disabled: !selected.length,
      run: () => setSelected([]),
    },
    {
      name: 'Add another detail',
      disabled: before,
      run: () => {
        actionFocus.current = compact
          ? '.model-sheet-handle'
          : '.model-add-tools button';
        if (compact) openPanel('add');
        else
          shell.current
            ?.querySelector<HTMLButtonElement>('.model-add-tools button')
            ?.focus();
      },
    },
    {
      name: 'Delete',
      shortcut: 'Del',
      disabled: before || !selected.some((id) => !locked.includes(id)),
      run: remove,
    },
  ];
  return (
    <ModelMobileContext
      value={{
        compact,
        tool: touchTool,
        setTool: setTouchTool,
        openPanel,
        planHost,
      }}
    >
      <Menu.Root
        open={actionMenuOpen}
        onOpenChange={setActionMenuOpen}
        modal={false}
      >
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <DialogContent
            ref={shell}
            className={`photo-model-workspace model-workspace ${compact ? 'model-compact' : ''} ${before ? 'model-before' : ''}`}
            data-panel={mobilePanel}
            data-detent={detent}
            showCloseButton={!compact}
            overlayClassName="photo-model-overlay"
            onContextMenu={(e) => {
              if (mode !== 'details' || !(e.target instanceof Element)) return;
              const detail = e.target.closest(
                '[data-element-id], [data-detail-id]',
              );
              if (!detail && !e.target.closest('.model-wall-canvas')) return;
              e.preventDefault();
              e.stopPropagation();
              const id =
                detail?.getAttribute('data-element-id') ||
                detail?.getAttribute('data-detail-id');
              if (id && !selected.includes(id)) setSelected([id]);
              showContextActions(e.clientX, e.clientY);
            }}
            onFocusCapture={(e) => {
              if (
                compact &&
                (e.target as HTMLElement).matches('input, textarea, select')
              ) {
                setDetent('full');
                requestAnimationFrame(() =>
                  (e.target as HTMLElement).scrollIntoView({
                    block: 'nearest',
                  }),
                );
              }
            }}
            onKeyDown={(e) => {
              if (e.defaultPrevented) return;
              const input = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                (e.target as HTMLElement).tagName,
              );
              if (
                !input &&
                mode === 'details' &&
                selected.length &&
                e.key === 'Delete'
              ) {
                e.preventDefault();
                if (!before) remove();
                return;
              }
              if (
                !input &&
                mode === 'details' &&
                selected.length &&
                e.key === 'Enter' &&
                (e.target as Element).matches('.model-wall-canvas')
              ) {
                e.preventDefault();
                actions[0].run();
                return;
              }
              if (
                !input &&
                mode === 'details' &&
                ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')
              ) {
                e.preventDefault();
                const b = (e.target as Element).getBoundingClientRect();
                showContextActions(
                  b.left + Math.min(40, b.width / 2),
                  b.top + Math.min(40, b.height / 2),
                );
                return;
              }
              if (
                !input &&
                mode === 'details' &&
                (e.ctrlKey || e.metaKey) &&
                e.key.toLowerCase() === 'a'
              ) {
                e.preventDefault();
                setSelected(elements.map((v) => v.id));
                return;
              }
              if (
                !input &&
                mode === 'details' &&
                (e.ctrlKey || e.metaKey) &&
                e.key.toLowerCase() === 'd'
              ) {
                e.preventDefault();
                if (!before) duplicate();
                return;
              }
              if (
                compact &&
                e.key === 'Escape' &&
                mobilePanel !== 'none' &&
                !['INPUT', 'TEXTAREA'].includes(
                  (e.target as HTMLElement).tagName,
                )
              ) {
                e.preventDefault();
                e.stopPropagation();
                if (paste) setPaste(null);
                else openPanel('none');
                return;
              }
              if (
                (e.ctrlKey || e.metaKey) &&
                !['INPUT', 'TEXTAREA', 'SELECT'].includes(
                  (e.target as HTMLElement).tagName,
                )
              ) {
                if (e.key.toLowerCase() === 'z') {
                  e.preventDefault();
                  setRoofDraft(null);
                  onHistory?.(e.shiftKey);
                }
                if (e.key.toLowerCase() === 'c' && selected.length) {
                  e.preventDefault();
                  setClipboard(stamp());
                }
                if (e.key.toLowerCase() === 'v' && clipboard && !before) {
                  e.preventDefault();
                  setPaste(clipboard);
                  setTargetWall(activeWall);
                }
              }
            }}
          >
            <header>
              <div>
                <DialogTitle>
                  {compact ? '' : 'Photo & model · '}
                  {String(edit.properties.name || 'Building')}
                </DialogTitle>
                <DialogDescription>
                  Precise building tools · dimensions are estimates unless
                  documented. Model doors do not create mapped entrances.
                </DialogDescription>
              </div>
              <output aria-live="polite">
                {unsaved ? 'Unsaved input · ' : ''}
                {state}
                {workspace?.error ? ` · ${workspace.error}` : ''}
              </output>
            </header>
            {compact && (
              <div className="model-mobile-navigation">
                <label>
                  Mode
                  <select
                    aria-label="Model editing mode"
                    value={mode}
                    onChange={(e) => switchMode(e.target.value as Mode)}
                  >
                    {(
                      [
                        'details',
                        'appearance',
                        'roof',
                        'outline',
                        'review',
                      ] as Mode[]
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m[0].toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => openPanel('walls')}
                  aria-label="Choose wall"
                >
                  {walls.find((w) => w.wallId === activeWall)?.label ||
                    'Choose wall'}
                </button>
                <button
                  aria-label="Undo"
                  disabled={!workspace?.past.length}
                  onClick={() => {
                    setRoofDraft(null);
                    onHistory?.();
                  }}
                >
                  ↶
                </button>
                <button
                  aria-label="Redo"
                  disabled={!workspace?.future.length}
                  onClick={() => {
                    setRoofDraft(null);
                    onHistory?.(true);
                  }}
                >
                  ↷
                </button>
                <button aria-label="Close workspace" onClick={onClose}>
                  ×
                </button>
              </div>
            )}
            <div className="model-toolbar model-main-toolbar">
              <nav aria-label="Building editing mode">
                {(
                  [
                    'details',
                    'appearance',
                    'roof',
                    'outline',
                    'review',
                  ] as Mode[]
                ).map((m) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                    {m === 'review' && publishErrors.length
                      ? ` (${publishErrors.length})`
                      : ''}
                  </button>
                ))}
              </nav>
              <button
                disabled={!onHistory || !workspace?.past.length}
                onClick={() => {
                  setRoofDraft(null);
                  onHistory?.();
                }}
              >
                Undo
              </button>
              <button
                disabled={!onHistory || !workspace?.future.length}
                onClick={() => {
                  setRoofDraft(null);
                  onHistory?.(true);
                }}
              >
                Redo
              </button>
              <button
                aria-pressed={before}
                onClick={() => setBefore((v) => !v)}
              >
                {before ? 'Showing before · show changes' : 'Before / after'}
              </button>
            </div>
            <div className="model-layout">
              <aside
                className="model-hierarchy"
                aria-label="Building hierarchy"
              >
                <label>
                  Find walls or details
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                {buildingTopology(feature).parts.map((part, index) => (
                  <section key={part.id}>
                    <button
                      className="model-wing"
                      onClick={() => {
                        onSelection({ buildingId: edit.id, partId: part.id });
                        switchMode('appearance');
                      }}
                    >
                      Wing {index + 1}
                    </button>
                    {walls
                      .filter((w) => w.partId === part.id)
                      .map((w) => {
                        const f =
                            draft.properties.appearance?.facades?.[w.wallId],
                          children =
                            w.wallId === activeWall
                              ? elements
                              : f?.elements || [],
                          title = authoring.names[w.wallId] || w.label;
                        if (
                          query &&
                          !`${title} ${children.map(label).join(' ')}`
                            .toLowerCase()
                            .includes(query.toLowerCase())
                        )
                          return null;
                        return (
                          <div key={w.wallId} className="model-wall-item">
                            <button
                              data-model-wall={w.wallId}
                              aria-pressed={activeWall === w.wallId}
                              onClick={() => {
                                choose(w.wallId);
                                if (compact) openPanel('none');
                              }}
                            >
                              {title}
                              <small>
                                {wallLength(w.coordinates).toFixed(1)} m ·{' '}
                                {f
                                  ? f.needsReview
                                    ? 'Rematch needed'
                                    : f.reviewedAt
                                      ? 'Reviewed'
                                      : 'Needs review'
                                  : 'Generated'}
                              </small>
                            </button>
                            {activeWall === w.wallId && (
                              <>
                                {authoring.groups
                                  .filter((g) => g.wallId === w.wallId)
                                  .map((g) => (
                                    <button
                                      key={g.id}
                                      onClick={() =>
                                        setSelected(
                                          g.members.filter((id) =>
                                            elements.some((e) => e.id === id),
                                          ),
                                        )
                                      }
                                    >
                                      Group · {g.name}
                                    </button>
                                  ))}
                                {authoring.patterns
                                  .filter((p) => p.wallId === w.wallId)
                                  .map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setPatternId(p.id);
                                        setSelected(p.members);
                                        setPattern({
                                          rows: p.rows,
                                          columns: p.columns,
                                          stepX: p.stepX,
                                          stepY: p.stepY,
                                        });
                                      }}
                                    >
                                      Pattern · {p.name}
                                    </button>
                                  ))}
                                {children
                                  .filter(
                                    (e) =>
                                      !query ||
                                      label(e)
                                        .toLowerCase()
                                        .includes(query.toLowerCase()),
                                  )
                                  .map((e) => (
                                    <button
                                      className="model-detail-item"
                                      data-detail-id={e.id}
                                      aria-label={label(e)}
                                      key={e.id}
                                      aria-pressed={selected.includes(e.id)}
                                      onClick={(event) => {
                                        setSelected(
                                          event.shiftKey ||
                                            touchTool === 'multi'
                                            ? toggle(selected, [e.id])
                                            : [e.id],
                                        );
                                        setInstance(0);
                                      }}
                                      role={
                                        compact && touchTool === 'multi'
                                          ? 'checkbox'
                                          : undefined
                                      }
                                      aria-checked={
                                        compact && touchTool === 'multi'
                                          ? selected.includes(e.id)
                                          : undefined
                                      }
                                    >
                                      {label(e)}
                                      {locked.includes(e.id) ? ' · locked' : ''}
                                      {hidden.includes(e.id) ? ' · hidden' : ''}
                                    </button>
                                  ))}
                              </>
                            )}
                          </div>
                        );
                      })}
                  </section>
                ))}
              </aside>
              <main className="model-stage">
                <label className="model-wall-picker">
                  Mapped wall
                  <select
                    value={activeWall}
                    onChange={(e) => choose(e.target.value)}
                  >
                    {walls.map((w) => (
                      <option key={w.wallId} value={w.wallId}>
                        {w.label} · {wallLength(w.coordinates).toFixed(2)} m
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset
                  className="model-mobile-tabs"
                  aria-label="Workspace view"
                >
                  {['wall', '3d', 'photo'].map((v) => (
                    <button
                      key={v}
                      aria-pressed={tab === v}
                      onClick={() => {
                        setTab(v);
                        openPanel('none');
                      }}
                    >
                      {v === 'wall' && (mode === 'roof' || mode === 'outline')
                        ? 'Plan'
                        : v === '3d'
                          ? '3D'
                          : v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </fieldset>
                <div className={`model-view-columns model-tab-${tab}`}>
                  <div
                    ref={setPlanHost}
                    className="model-plan-host"
                    hidden={
                      !compact ||
                      tab !== 'wall' ||
                      !['roof', 'outline'].includes(mode)
                    }
                  />
                  <div className="model-edit-view">
                    {mode === 'details' && metrics && (
                      <>
                        {!facade && !conversion && (
                          <div className="model-notice">
                            <p>
                              Adding a detail preserves this wall’s generated
                              layout. You can also preview and convert it before
                              editing.
                            </p>
                            <button
                              onClick={() =>
                                tryAction(() =>
                                  setConversion(
                                    editableFacade(feature, activeWall, visual),
                                  ),
                                )
                              }
                            >
                              Preview editable layout
                            </button>
                          </div>
                        )}
                        {conversion && (
                          <div className="model-notice">
                            <p>
                              Preview:{' '}
                              {conversion.elements.reduce(
                                (n, e) => n + e.count,
                                0,
                              )}{' '}
                              generated details become editable. Existing
                              proportions are retained.
                            </p>
                            <button onClick={() => applyWall(conversion)}>
                              Use editable layout
                            </button>
                            <button onClick={() => setConversion(null)}>
                              Cancel conversion
                            </button>
                          </div>
                        )}
                        {pending?.wallId === activeWall && (
                          <div className="model-notice">
                            <p>
                              Unfinished wall retained locally. Resolve its
                              placement or building errors, then save it.
                            </p>
                            <button onClick={() => applyWall(pending)}>
                              Save unfinished wall
                            </button>
                            <button onClick={() => switchMode('appearance')}>
                              Check building height
                            </button>
                          </div>
                        )}
                        <ModelWallCanvas
                          actions={selectionActions}
                          interactive={
                            !compact || (tab === 'wall' && panel === 'none')
                          }
                          detailName={label}
                          views={wallViews.current}
                          key={activeWall}
                          metrics={metrics}
                          elements={
                            before
                              ? initial.current.properties.appearance
                                  ?.facades?.[activeWall]?.elements ||
                                editableFacade(original, activeWall, visual)
                                  .elements
                              : elements
                          }
                          selected={selected}
                          hidden={hidden}
                          locked={locked}
                          grid={grid}
                          onSelect={(ids, i) => {
                            setSelected(ids);
                            setInstance(i || 0);
                          }}
                          onCommit={(next) => {
                            if (!before) updateElements(next);
                          }}
                          onDuplicate={duplicate}
                          onDelete={remove}
                        />
                      </>
                    )}
                    {(mode === 'appearance' || mode === 'roof') && (
                      <div data-mobile-panel="mode">
                        <BuildingAppearanceEditor
                          embedded
                          workspace={workspace}
                          edit={draft}
                          data={data}
                          mode={mode}
                          onMode={switchMode}
                          selection={
                            selection || {
                              buildingId: edit.id,
                              partId: metrics?.partId,
                              wallId: activeWall,
                            }
                          }
                          onSelection={(next) => {
                            const id =
                              next.wallId ||
                              (next.partId !== metrics?.partId
                                ? walls.find((w) => w.partId === next.partId)
                                    ?.wallId
                                : undefined);
                            if (id && id !== activeWall) choose(id);
                            onSelection(next);
                          }}
                          onEdit={(next) => commit(next)}
                          onHeightEdit={(next) => commit(next, true)}
                          roofDraft={roofDraft}
                          onRoofDraft={onRoofDraft}
                          onApplyRoof={onRoofApply}
                        />
                      </div>
                    )}
                    {mode === 'outline' && (
                      <div data-mobile-panel="mode">
                        <ModelOutlineCanvas
                          edit={draft}
                          workspace={workspace}
                          onCommit={(next) => commit(next, true)}
                        />
                      </div>
                    )}
                    {mode === 'review' && (
                      <section
                        className="model-review"
                        data-mobile-panel="mode"
                      >
                        <h3>Model review</h3>
                        <p>
                          Saving preserves your draft. Only walls explicitly
                          reviewed receive approval.
                        </p>
                        {publishErrors.map((e, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              switchMode(
                                /height|floor/i.test(e)
                                  ? 'appearance'
                                  : 'details',
                              );
                              if (!/height|floor/i.test(e)) openPanel('more');
                            }}
                          >
                            {e}
                          </button>
                        ))}
                        {Object.values(
                          draft.properties.appearance?.facades || {},
                        ).map((f) => {
                          const w = walls.find((w) => w.wallId === f.wallId),
                            changed =
                              JSON.stringify(
                                initial.current.properties.appearance
                                  ?.facades?.[f.wallId],
                              ) !== JSON.stringify(f);
                          return (
                            <article key={f.wallId}>
                              <strong>
                                {w?.label || 'Removed wall'}
                                {changed ? ' · changed this session' : ''}
                              </strong>
                              <p>
                                {f.confidence === 'inferred'
                                  ? 'Illustrative estimate'
                                  : f.confidence === 'observed'
                                    ? 'Photo observed · estimated dimensions'
                                    : 'Documented dimensions'}{' '}
                                · {f.elements.length} records ·{' '}
                                {f.reviewedAt ? 'Reviewed' : 'Needs review'}
                              </p>
                              {changed && (
                                <ul>
                                  {f.elements
                                    .filter(
                                      (e) =>
                                        JSON.stringify(
                                          initial.current.properties.appearance?.facades?.[
                                            f.wallId
                                          ]?.elements.find(
                                            (old) => old.id === e.id,
                                          ),
                                        ) !== JSON.stringify(e),
                                    )
                                    .map((e) => (
                                      <li key={e.id}>
                                        {label(e)} ·{' '}
                                        {initial.current.properties.appearance?.facades?.[
                                          f.wallId
                                        ]?.elements.some(
                                          (old) => old.id === e.id,
                                        )
                                          ? 'modified'
                                          : 'added'}
                                      </li>
                                    ))}
                                  {(
                                    initial.current.properties.appearance
                                      ?.facades?.[f.wallId]?.elements || []
                                  )
                                    .filter(
                                      (e) =>
                                        !f.elements.some(
                                          (next) => next.id === e.id,
                                        ),
                                    )
                                    .map((e) => (
                                      <li key={e.id}>{label(e)} · removed</li>
                                    ))}
                                </ul>
                              )}
                              <button
                                onClick={() => {
                                  choose(w?.wallId || activeWall);
                                  setMode('details');
                                  openPanel('more');
                                  setTab('wall');
                                }}
                              >
                                Inspect details and evidence
                              </button>
                              {!w && metrics && (
                                <button
                                  onClick={() => {
                                    if (recorded) {
                                      setError(
                                        'The selected wall already has details. Choose an empty wall before rematching.',
                                      );
                                      return;
                                    }
                                    const oldLength = wallLength(
                                        f.wallCoordinates,
                                      ),
                                      next = {
                                        ...f,
                                        wallId: activeWall,
                                        partId: metrics.partId,
                                        wallCoordinates: metrics.coordinates,
                                        elements: f.elements.map((e) => ({
                                          ...e,
                                          x: (e.x * oldLength) / metrics.length,
                                          spacing:
                                            (e.spacing * oldLength) /
                                            metrics.length,
                                        })),
                                        needsReview: true,
                                        reviewedAt: undefined,
                                      };
                                    const facades = {
                                      ...draft.properties.appearance?.facades,
                                    };
                                    delete facades[f.wallId];
                                    facades[activeWall] = next;
                                    commit({
                                      ...draft,
                                      properties: {
                                        ...draft.properties,
                                        appearance: {
                                          ...draft.properties.appearance,
                                          facades,
                                        },
                                      },
                                    });
                                  }}
                                >
                                  Rematch to selected empty wall
                                </button>
                              )}
                            </article>
                          );
                        })}
                        {!Object.keys(
                          draft.properties.appearance?.facades || {},
                        ).length && <p>No custom wall details yet.</p>}
                      </section>
                    )}
                  </div>
                  <div className="model-3d-view">
                    <PhotoModelPreview
                      onActions={showContextActions}
                      active={!compact || tab === '3d'}
                      hidden={hidden}
                      feature={before ? original : feature}
                      visual={visual}
                      data={data}
                      wallId={activeWall}
                      selection={{
                        buildingId: edit.id,
                        wallId: activeWall,
                        elementId:
                          selected.length === 1 ? selected[0] : undefined,
                        instanceIndex: instance,
                      }}
                      onSelect={(s) => {
                        if (s.wallId)
                          choose(s.wallId, s.elementId, s.instanceIndex);
                      }}
                    />
                  </div>
                  <div className="model-photo-view">
                    <button
                      aria-expanded={reference}
                      onClick={() => setReference((v) => !v)}
                    >
                      {reference ? 'Hide' : 'Show'} photograph reference
                    </button>
                    {(reference || compact) && (
                      <ModelPhotoPanel
                        key={`${edit.id}:${activeWall}:${photo?.id || ''}`}
                        photos={photos}
                        photo={photo}
                        onPhoto={setPhotoId}
                        facade={facade}
                        workspace={workspace}
                        buildingId={edit.id}
                        onCommit={(next) => applyWall(next)}
                      />
                    )}
                  </div>
                </div>
              </main>
              <aside
                className="model-inspector"
                aria-label="Model detail properties"
              >
                {compact && panel === 'more' && mode === 'details' && (
                  <div className="model-more-shortcuts">
                    <button
                      onClick={() => {
                        setBefore((v) => !v);
                        openPanel('none');
                      }}
                    >
                      {before ? 'Show changes' : 'Before / after'}
                    </button>
                    <button
                      onClick={() => {
                        openPanel('walls');
                        setTouchTool('multi');
                      }}
                    >
                      Multi-select
                    </button>
                    {!facade && !conversion && (
                      <button
                        onClick={() => {
                          tryAction(() =>
                            setConversion(
                              editableFacade(feature, activeWall, visual),
                            ),
                          );
                          openPanel('none');
                        }}
                      >
                        Preview editable layout
                      </button>
                    )}
                    {unsaved && (
                      <button onClick={discardInput}>
                        Discard unfinished input
                      </button>
                    )}
                  </div>
                )}
                {mode === 'details' && metrics && (
                  <>
                    <label>
                      Snap grid
                      <select
                        value={grid}
                        onChange={(e) => setGrid(Number(e.target.value))}
                      >
                        <option value={0.01}>0.01 m</option>
                        <option value={0.1}>0.1 m</option>
                        <option value={1}>1 m</option>
                      </select>
                    </label>
                    <div className="model-add-tools">
                      {kinds.map((k) => (
                        <button
                          key={k}
                          disabled={before}
                          onClick={() => {
                            add(k);
                            if (compact) {
                              setTab('wall');
                              openPanel('none');
                            }
                          }}
                        >
                          Add {k}
                        </button>
                      ))}
                    </div>
                    {compact && panel === 'more' && (
                      <Menu.Trigger
                        className="model-detail-actions"
                        onClick={() => setContextPoint(null)}
                      >
                        Selection actions
                      </Menu.Trigger>
                    )}
                    {selected.length > 1 && (
                      <div className="model-toolbar">
                        {(
                          [
                            'left',
                            'centre',
                            'right',
                            'bottom',
                            'top',
                            'distribute',
                            'mirror',
                          ] as const
                        ).map((action) => (
                          <button
                            key={action}
                            onClick={() =>
                              updateElements(
                                layoutElements(
                                  elements,
                                  selected.filter((id) => !locked.includes(id)),
                                  metrics.length,
                                  action,
                                ),
                              )
                            }
                          >
                            {action === 'distribute'
                              ? 'Equal gaps'
                              : action === 'mirror'
                                ? 'Mirror layout'
                                : `Align ${action}`}
                          </button>
                        ))}
                      </div>
                    )}
                    {active && selected.length === 1 && (
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
                            commit({
                              ...draft,
                              properties: {
                                ...draft.properties,
                                modelAuthoring: {
                                  ...authoring,
                                  names: {
                                    ...authoring.names,
                                    [active.id]: v.slice(0, 120),
                                  },
                                },
                              },
                            })
                          }
                        />
                        <div className="model-properties-grid">
                          {field(
                            'x',
                            'Centre from A (m)',
                            active.x * metrics.length,
                            0,
                            metrics.length,
                          )}
                          {field(
                            'bottom',
                            'Bottom above base (m)',
                            active.bottom,
                          )}
                          {field('width', 'Width (m)', active.width, 0.01)}
                          {field('height', 'Height (m)', active.height, 0.01)}
                          {field(
                            'depth',
                            'Projection (m)',
                            active.depth,
                            0,
                            10,
                          )}
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
                          Edges:{' '}
                          {elementBounds(active, metrics.length).left.toFixed(
                            2,
                          )}
                          –
                          {elementBounds(active, metrics.length).right.toFixed(
                            2,
                          )}{' '}
                          m from A.
                        </p>
                        {active.count > 1 && (
                          <>
                            <label>
                              Repeated instance
                              <select
                                value={Math.min(instance, active.count - 1)}
                                onChange={(e) =>
                                  setInstance(Number(e.target.value))
                                }
                              >
                                {Array.from(
                                  { length: active.count },
                                  (_, i) => (
                                    <option key={i} value={i}>
                                      {i + 1}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <button
                              onClick={() =>
                                tryAction(() => {
                                  const next = detachInstance(
                                    elements,
                                    active.id,
                                    instance,
                                  );
                                  if (updateElements(next.elements))
                                    setSelected([next.detachedId]);
                                })
                              }
                            >
                              Detach selected instance
                            </button>
                          </>
                        )}
                      </>
                    )}
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
                        <button
                          disabled={!selected.length}
                          onClick={() =>
                            commit({
                              ...draft,
                              properties: {
                                ...draft.properties,
                                modelAuthoring: {
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
                                },
                              },
                            })
                          }
                        >
                          Group selection
                        </button>
                        <button
                          onClick={() =>
                            commit({
                              ...draft,
                              properties: {
                                ...draft.properties,
                                modelAuthoring: {
                                  ...authoring,
                                  groups: authoring.groups.filter(
                                    (g) =>
                                      !g.members.some((id) =>
                                        selected.includes(id),
                                      ),
                                  ),
                                },
                              },
                            })
                          }
                        >
                          Ungroup
                        </button>
                        <button
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
                                    { id: crypto.randomUUID(), ...stamp() },
                                  ],
                                },
                              },
                            })
                          }
                        >
                          Save preset
                        </button>
                      </div>
                      <label>
                        Pattern
                        <select
                          value={patternId}
                          onChange={(e) => {
                            setPatternId(e.target.value);
                            const p = authoring.patterns.find(
                              (p) => p.id === e.target.value,
                            );
                            if (p)
                              setPattern({
                                rows: p.rows,
                                columns: p.columns,
                                stepX: p.stepX,
                                stepY: p.stepY,
                              });
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
                      {(['rows', 'columns', 'stepX', 'stepY'] as const).map(
                        (k) => (
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
                              value={
                                Number.isFinite(pattern[k]) ? pattern[k] : ''
                              }
                              onChange={(e) =>
                                setPattern({
                                  ...pattern,
                                  [k]:
                                    e.target.value === ''
                                      ? NaN
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        ),
                      )}
                      <button onClick={editPattern}>
                        {patternId ? 'Update pattern' : 'Create pattern'}
                      </button>
                      <button
                        disabled={!patternId || selected.length !== 1}
                        onClick={() => {
                          const p = authoring.patterns.find(
                            (p) => p.id === patternId,
                          );
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
                                            (_, i) =>
                                              !selected.includes(v.members[i]),
                                          ),
                                          excluded: [
                                            ...new Set([
                                              ...(v.excluded || []),
                                              ...patternSlots(v).filter(
                                                (_, i) =>
                                                  selected.includes(
                                                    v.members[i],
                                                  ),
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
                      </button>
                      {(workspace?.edits || [draft]).flatMap((e) =>
                        (e.properties.modelAuthoring?.presets || []).map(
                          (p) => (
                            <button
                              key={`${e.id}:${p.id}`}
                              onClick={() => {
                                setPaste(p);
                                setTargetWall(activeWall);
                              }}
                            >
                              Insert preset · {p.name}
                            </button>
                          ),
                        ),
                      )}
                    </details>
                    {facade && (
                      <details open={!!facade.needsReview}>
                        <summary>Evidence &amp; wall review</summary>
                        <label>
                          Evidence confidence
                          <select
                            value={facade.confidence}
                            onChange={(e) =>
                              applyWall({
                                ...facade,
                                confidence: e.target
                                  .value as FacadeDescription['confidence'],
                              })
                            }
                          >
                            <option value="inferred">
                              Illustrative estimate
                            </option>
                            <option value="observed">
                              Observed in photograph
                            </option>
                            <option value="documented">
                              Documented measurements
                            </option>
                          </select>
                        </label>
                        <ModelField
                          type="text"
                          label="Evidence and measurement provenance"
                          value={facade.notes}
                          buildingId={edit.id}
                          field={`${activeWall}:notes`}
                          workspace={workspace}
                          onCommit={(v) => applyWall({ ...facade, notes: v })}
                        />
                        {photo && (
                          <button
                            onClick={() =>
                              applyWall({
                                ...facade,
                                photoIds: [
                                  ...new Set([...facade.photoIds, photo.id]),
                                ],
                              })
                            }
                          >
                            Use selected photo as evidence
                          </button>
                        )}
                        {facade.photoIds.map((id) => (
                          <p key={id}>
                            {photos.find((p) => p.id === id)?.caption ||
                              'Unavailable photo'}{' '}
                            <button
                              onClick={() =>
                                applyWall({
                                  ...facade,
                                  photoIds: facade.photoIds.filter(
                                    (p) => p !== id,
                                  ),
                                  texture:
                                    facade.texture?.photoId === id
                                      ? undefined
                                      : facade.texture,
                                })
                              }
                            >
                              Remove reference
                            </button>
                          </p>
                        ))}
                        {(facade.needsReview ||
                          !facadeMatches(facade, feature)) && (
                          <button
                            onClick={() => {
                              const length = wallLength(facade.wallCoordinates);
                              applyWall({
                                ...facade,
                                wallCoordinates: metrics.coordinates,
                                partId: metrics.partId,
                                needsReview: false,
                                elements: facade.elements.map((e) => ({
                                  ...e,
                                  x: (e.x * length) / metrics.length,
                                  spacing:
                                    (e.spacing * length) / metrics.length,
                                })),
                              });
                            }}
                          >
                            Confirm wall match · preserve metre positions
                          </button>
                        )}
                        <button
                          disabled={
                            !!facade.needsReview ||
                            !facadeMatches(facade, feature)
                          }
                          onClick={() => applyWall(facade, authoring, true)}
                        >
                          Mark this wall reviewed
                        </button>
                        <button
                          onClick={() => {
                            const facades = {
                              ...draft.properties.appearance?.facades,
                            };
                            delete facades[activeWall];
                            commit({
                              ...draft,
                              properties: {
                                ...draft.properties,
                                modelAuthoring: {
                                  ...authoring,
                                  groups: authoring.groups.filter(
                                    (g) => g.wallId !== activeWall,
                                  ),
                                  patterns: authoring.patterns.filter(
                                    (p) => p.wallId !== activeWall,
                                  ),
                                },
                                appearance: {
                                  ...draft.properties.appearance,
                                  facades,
                                },
                              },
                            });
                          }}
                        >
                          Restore generated wall
                        </button>
                      </details>
                    )}
                  </>
                )}
                {mode !== 'details' && (
                  <p>
                    Select Details to edit individual architectural elements.
                    Roof and footprint changes may require another wall review.
                  </p>
                )}
              </aside>
            </div>
            {compact && (
              <>
                {mobilePanel !== 'none' && (
                  <div className="model-sheet-heading">
                    <button
                      className="model-sheet-handle"
                      aria-label={
                        detent === 'half' ? 'Expand tools' : 'Collapse tools'
                      }
                      onPointerDown={(e) => {
                        sheetDragged.current = false;
                        sheetStart.current = e.clientY;
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerUp={(e) => {
                        const dy = e.clientY - sheetStart.current;
                        if (Math.abs(dy) > 25) {
                          sheetDragged.current = true;
                          if (dy > 90 && detent === 'half') openPanel('none');
                          else setDetent(dy < 0 ? 'full' : 'half');
                        }
                      }}
                      onClick={() => {
                        if (!sheetDragged.current)
                          setDetent((d) => (d === 'half' ? 'full' : 'half'));
                      }}
                    >
                      ↕{' '}
                      {mobilePanel === 'mode'
                        ? mode
                        : mobilePanel === 'walls'
                          ? 'Walls & details'
                          : mobilePanel === 'edit'
                            ? 'Detail properties'
                            : mobilePanel === 'more'
                              ? 'More tools'
                              : mobilePanel === 'photo'
                                ? 'Photo alignment'
                                : mobilePanel === 'copy'
                                  ? 'Copy placement'
                                  : 'Add detail'}
                    </button>
                    <button
                      onClick={() => {
                        (document.activeElement as HTMLElement)?.blur();
                        if (paste) setPaste(null);
                        else {
                          const multi = touchTool === 'multi';
                          openPanel('none');
                          if (multi) setTouchTool('multi');
                        }
                      }}
                    >
                      Done
                    </button>
                  </div>
                )}
                {error && (
                  <div role="alert">
                    <button
                      className="model-mobile-error"
                      onClick={() => switchMode('review')}
                    >
                      {error}
                    </button>
                  </div>
                )}
                <div className="model-selection-strip" aria-live="polite">
                  {mode === 'details' && selected.length
                    ? `${selected.length} selected${active && selected.length === 1 ? ' · ' + label(active) : ''}`
                    : metrics
                      ? `${metrics.length.toFixed(1)} m · ${metrics.direction} wall`
                      : 'Choose a wall'}{' '}
                  ·{' '}
                  {touchTool === 'multi'
                    ? 'Multi-select'
                    : touchTool === 'select'
                      ? 'Tap to select'
                      : touchTool === 'move'
                        ? 'Move enabled'
                        : 'Resize enabled'}
                  {before ? ' · Before (read only)' : ''}
                </div>
                <nav
                  className="model-bottom-actions"
                  aria-label="Mobile model actions"
                >
                  {mode === 'details' ? (
                    selected.length ? (
                      <>
                        <button
                          disabled={
                            before ||
                            selected.every((id) => locked.includes(id))
                          }
                          aria-pressed={touchTool === 'move'}
                          onClick={() => {
                            openPanel('none');
                            setTouchTool(
                              touchTool === 'move' ? 'select' : 'move',
                            );
                            setTab('wall');
                          }}
                        >
                          Move
                        </button>
                        <button
                          disabled={
                            before ||
                            selected.length !== 1 ||
                            selected.every((id) => locked.includes(id)) ||
                            active?.count !== 1
                          }
                          aria-pressed={touchTool === 'resize'}
                          onClick={() => {
                            openPanel('none');
                            setTouchTool(
                              touchTool === 'resize' ? 'select' : 'resize',
                            );
                            setTab('wall');
                          }}
                        >
                          Resize
                        </button>
                        <button onClick={() => openPanel('edit')}>Edit</button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={before}
                          onClick={() => openPanel('add')}
                        >
                          Add
                        </button>
                        <button onClick={() => openPanel('walls')}>
                          Walls
                        </button>
                        <button
                          aria-pressed={touchTool === 'multi'}
                          onClick={() => {
                            openPanel('walls');
                            setTouchTool('multi');
                          }}
                        >
                          Multi-select
                        </button>
                      </>
                    )
                  ) : (
                    <>
                      <button onClick={() => openPanel('mode')}>
                        {mode === 'review' ? 'Review issues' : 'Edit ' + mode}
                      </button>
                      <button
                        onClick={() => {
                          openPanel('none');
                          setTouchTool(
                            touchTool === 'move' ? 'select' : 'move',
                          );
                          setTab('wall');
                        }}
                        disabled={!['roof', 'outline'].includes(mode)}
                        aria-pressed={touchTool === 'move'}
                      >
                        Move point
                      </button>
                      <button onClick={() => openPanel('walls')}>Walls</button>
                    </>
                  )}
                  <button
                    onClick={() =>
                      openPanel(tab === 'photo' ? 'photo' : 'more')
                    }
                  >
                    More
                  </button>
                </nav>
                {mobilePanel === 'more' && mode !== 'details' && (
                  <section data-mobile-panel="more">
                    <button
                      onClick={() => {
                        setBefore((v) => !v);
                        openPanel('none');
                      }}
                    >
                      Before / after
                    </button>
                    <button onClick={() => switchMode('details')}>
                      Edit architectural details
                    </button>
                    <button onClick={() => switchMode('review')}>
                      Review changes
                    </button>
                    {unsaved && (
                      <button onClick={discardInput}>
                        Discard unfinished input
                      </button>
                    )}
                  </section>
                )}
              </>
            )}
            {paste && (
              <section
                className="model-paste-preview"
                aria-label="Copy placement preview"
              >
                <h3>Copy {paste.elements.length} detail records</h3>
                <div className="model-properties-grid">
                  {(['x', 'y', 'scale'] as const).map((key) => (
                    <ModelField
                      key={key}
                      label={
                        key === 'x'
                          ? 'Horizontal offset (m)'
                          : key === 'y'
                            ? 'Vertical offset (m)'
                            : 'Explicit size multiplier'
                      }
                      value={pasteTransform[key]}
                      buildingId={edit.id}
                      field={`paste:${key}`}
                      min={key === 'scale' ? 0.01 : -150}
                      max={key === 'scale' ? 10 : 150}
                      onCommit={(v) => {
                        setPasteTransform((t) => ({ ...t, [key]: Number(v) }));
                        return true;
                      }}
                    />
                  ))}
                </div>
                <p>
                  Dimensions and spacing stay in metres. New placements require
                  owner review.
                </p>
                <label>
                  Target building
                  <select
                    aria-label="Target building"
                    value={targetBuilding}
                    onChange={(e) => {
                      setTargetBuilding(e.target.value);
                      setTargetWall('');
                    }}
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Target wall
                  <select
                    aria-label="Target wall"
                    value={targetWall || targetWalls[0]?.wallId || ''}
                    onChange={(e) => setTargetWall(e.target.value)}
                  >
                    {targetWalls.map((w) => (
                      <option key={w.wallId} value={w.wallId}>
                        {w.label} · {wallLength(w.coordinates).toFixed(2)} m
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  First detail centre:{' '}
                  {(paste.elements[0]?.x * paste.wallLength).toFixed(2)} m from
                  A; height {paste.elements[0]?.bottom.toFixed(2)} m.
                </p>
                {targetEdit &&
                  targetWalls.length > 0 &&
                  (() => {
                    const id = targetWall || targetWalls[0].wallId,
                      m = wallMetrics(
                        modelFeature(targetEdit),
                        id,
                        data.visuals?.buildings.find(
                          (v) => v.id === targetEdit.id,
                        ),
                      ),
                      values = copiedPlacement(paste, m.length),
                      bad = new Set(
                        placementErrors(values, m.length, m.eaves).map(
                          (e) => e.id,
                        ),
                      );
                    return (
                      <svg
                        className="model-copy-canvas"
                        aria-label="Copied layout preview on target wall"
                        viewBox={`-1 ${-m.eaves - 1} ${m.length + 2} ${m.eaves + 2}`}
                      >
                        <rect
                          x={0}
                          y={-m.eaves}
                          width={m.length}
                          height={m.eaves}
                          fill={m.style.wallColour || '#ddd6c5'}
                        />
                        {values.flatMap((e) =>
                          Array.from({ length: e.count }, (_, i) => (
                            <rect
                              key={`${e.id}:${i}`}
                              x={
                                (e.x + (i - (e.count - 1) / 2) * e.spacing) *
                                  m.length -
                                e.width / 2
                              }
                              y={-e.bottom - e.height}
                              width={e.width}
                              height={e.height}
                              fill={bad.has(e.id) ? '#db3535' : e.colour}
                              stroke="#168aff"
                              strokeWidth={0.08}
                            />
                          )),
                        )}
                      </svg>
                    );
                  })()}
                <button onClick={confirmPaste}>Confirm placement</button>
                <button onClick={() => setPaste(null)}>Cancel copy</button>
              </section>
            )}
            <footer>
              {error && <p role="alert">{error}</p>}
              <span>
                Draft changes save automatically. Publication requires release
                review.
              </span>
              {unsaved && (
                <button
                  onClick={() => {
                    setPending(null);
                    setRoofDraft(null);
                    workspace?.draftRoof(null);
                    for (const key of Object.keys(
                      workspace?.modelInputs[edit.id] || {},
                    ))
                      workspace?.recoverModelInput(edit.id, key);
                    setError(
                      'Unfinished input discarded; saved draft changes remain.',
                    );
                  }}
                >
                  Discard unfinished input
                </button>
              )}
              <button onClick={onClose}>Close workspace</button>
            </footer>
          </DialogContent>
          <Menu.Portal>
            <Menu.Positioner
              anchor={
                contextPoint
                  ? {
                      getBoundingClientRect: () =>
                        new DOMRect(contextPoint.x, contextPoint.y, 0, 0),
                    }
                  : undefined
              }
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              style={{ zIndex: 100 }}
            >
              <Menu.Popup
                className="model-action-menu"
                aria-label="Detail actions"
                finalFocus={() => {
                  const target = actionFocus.current;
                  actionFocus.current = null;
                  if (
                    !target &&
                    contextPoint &&
                    contextReturn.current?.isConnected
                  ) {
                    // The menu library restores HTML focus only; our keyboard canvas is SVG.
                    contextReturn.current.focus();
                    return false;
                  }
                  return target
                    ? shell.current?.querySelector<HTMLElement>(target) || true
                    : true;
                }}
              >
                <p>
                  {selected.length === 1 && active
                    ? label(active)
                    : `${selected.length} details selected`}
                </p>
                {actions.map((action) => (
                  <Menu.Item
                    aria-label={action.name}
                    key={action.name}
                    disabled={action.disabled}
                    onClick={action.run}
                    className={
                      action.name === 'Delete' ? 'model-menu-danger' : undefined
                    }
                  >
                    <span>{action.name}</span>
                    {action.shortcut && <kbd>{action.shortcut}</kbd>}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Dialog>
      </Menu.Root>
    </ModelMobileContext>
  );
}
