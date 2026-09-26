import {
  Trash2 as ActionTrash2,
  X as ActionX,
  Check as ActionCheck,
  RotateCcw as ActionRotateCcw,
  Group as ActionGroup,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  Plus as ActionPlus,
  ArrowLeft,
  Undo2,
  Redo2,
  PanelLeft,
  Paintbrush,
  Pentagon,
  House,
  ListChecks,
  Layers,
  MoreHorizontal,
  Columns2,
  Image,
  Orbit,
  ScanFace,
  Ruler,
  Ungroup,
  Split,
} from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  ModelSurfaceContext,
  type SurfaceFrame,
  type SurfacePreview,
} from './model-surface';
import { ModelStructureTree } from './ModelStructureTree';
import { modelTree, type ModelTreeTarget } from './model-tree';
import {
  commitDetailInstances,
  detailInstanceId,
  detailInstanceSelection,
  expandDetailInstances,
} from './model-instances';
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
import {
  facadeErrors,
  facadeMatches,
  facadeReviewIssues,
  facadeWalls,
} from './building-facades';
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
  ModelPlanPortal,
  useCompactModel,
  useLandscapeModel,
  useModelMedia,
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
  'text',
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
  returnFocus?: RefObject<HTMLElement | null>;
  workspace?: EditorWorkspace;
  onHistory?: (redo?: boolean) => void;
  initialMode?: Mode;
  initialField?: string;
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
      <DialogContent
        className="photo-model-workspace"
        finalFocus={props.returnFocus}
      >
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
              <ModelButton
                variant="destructive"
                icon={<ActionTrash2 />}
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
              </ModelButton>
            ) : (
              <p>
                This record contains incomplete data. Close the workspace and
                download local recovery before repairing it. Its contents have
                not been discarded.
              </p>
            )}
          </section>
        ))}
        <ModelButton
          variant="outline"
          icon={<ActionX />}
          onClick={props.onClose}
        >
          Close workspace
        </ModelButton>
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
  returnFocus: opener,
  workspace,
  onHistory,
  initialMode = 'details',
  initialField,
}: WorkspaceProps) {
  const compact = useCompactModel();
  const landscape = useLandscapeModel() && compact;
  const wide = useModelMedia('(min-width: 1200px)');
  const [structurePreference, setStructureOpen] = useState<boolean | null>(
    null,
  );
  const structureOpen = structurePreference ?? wide;
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(initialMode === 'review');
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
      shell.current?.style.setProperty(
        '--model-viewport-width',
        `${viewport?.width || innerWidth}px`,
      );
      shell.current?.style.setProperty(
        '--model-viewport-left',
        `${viewport?.offsetLeft || 0}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    if (compact && panel !== 'none')
      requestAnimationFrame(() =>
        shell.current
          ?.querySelector<HTMLButtonElement>(
            landscape ? '.model-panel-tabs button' : '.model-sheet-handle',
          )
          ?.focus(),
      );
  }, [compact, panel, landscape]);
  useEffect(() => {
    if (!initialField) return;
    const labels: Record<string, string> = {
      height: 'Total building height (m)',
      floors: 'Building floors',
      heightMode: 'Height information',
      heightSource: 'Height source',
      heightEstimated: 'Height is estimated',
    };
    const frame = requestAnimationFrame(() => {
      const target = Array.from(
        shell.current?.querySelectorAll<HTMLElement>(
          'input, select, textarea',
        ) || [],
      ).find(
        (element) =>
          element.getAttribute('aria-label') === labels[initialField] ||
          element.getAttribute('data-model-field') ===
            `building:${initialField}`,
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialField]);
  const initial = useRef(edit),
    returnFocus = useRef(document.activeElement as HTMLElement | null);
  const wallViews = useRef(new Map<string, WallView>());
  const [local, setLocal] = useState(edit),
    [mode, setMode] = useState<Mode>(initialMode),
    [wallId, setWallId] = useState(selection?.wallId || ''),
    [selected, setSelected] = useState<string[]>([]),
    [instance, setInstance] = useState(0);
  const [tab, setTab] = useState('3d'),
    [before, setBefore] = useState(false),
    [error, setError] = useState(''),
    [grid, setGrid] = useState(0.1);
  const [wholeRows, setWholeRows] = useState<string[]>([]);
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
  const [surfaceFrame, setSurfaceFrame] = useState<SurfaceFrame | null>(null);
  const [surfacePreview, setSurfacePreview] = useState<SurfacePreview>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const receiveSurfaceFrame = useCallback(
    (frame: SurfaceFrame | null) =>
      setSurfaceFrame((old) =>
        JSON.stringify(old) === JSON.stringify(frame) ? old : frame,
      ),
    [],
  );
  const [conversion, setConversion] = useState<FacadeDescription | null>(null);
  const [pasteTransform, setPasteTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  useEffect(() => setPasteTransform({ x: 0, y: 0, scale: 1 }), [paste]);
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
  const generatedFacades = useMemo(
    () =>
      Object.fromEntries(
        walls.flatMap((wall) => {
          if (feature.properties?.appearance?.facades?.[wall.wallId]) return [];
          try {
            return [
              [wall.wallId, editableFacade(feature, wall.wallId, visual)],
            ];
          } catch {
            return [];
          }
        }),
      ),
    [walls, feature, visual],
  );
  const facade =
    pending?.wallId === activeWall
      ? pending
      : recorded || conversion || generatedFacades[activeWall];
  const sourceElements = facade?.elements || emptyElements;
  const elements = useMemo(
    () => expandDetailInstances(sourceElements, wholeRows),
    [sourceElements, wholeRows],
  );
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => elements.some((e) => e.id === id));
      return next.length === current.length ? current : next;
    });
  }, [elements]);
  const renderedFeature = useMemo(() => {
    if (before) return original;
    const previewFeature: ReturnType<typeof modelFeature> = {
      ...feature,
      properties: {
        ...feature.properties,
        appearance: {
          ...feature.properties?.appearance,
          facades: {
            ...generatedFacades,
            ...feature.properties?.appearance?.facades,
            ...(pending?.wallId === activeWall
              ? { [activeWall]: pending }
              : {}),
          },
        },
      },
    };
    if (tab !== 'surface' || !surfacePreview) return previewFeature;
    if ('edit' in surfacePreview) return modelFeature(surfacePreview.edit);
    const next = structuredClone(previewFeature);
    next.properties ||= {};
    next.properties.appearance ||= {};
    if ('roof' in surfacePreview)
      (next.properties.appearance.roofs ||= {})[surfacePreview.roof.partId] =
        surfacePreview.roof.roof;
    else {
      const base =
        next.properties.appearance.facades?.[surfacePreview.wallId] ||
        editableFacade(feature, surfacePreview.wallId, visual);
      (next.properties.appearance.facades ||= {})[surfacePreview.wallId] = {
        ...base,
        elements: surfacePreview.elements,
      };
    }
    return next;
  }, [
    feature,
    original,
    before,
    tab,
    surfacePreview,
    visual,
    generatedFacades,
    pending,
    activeWall,
  ]);
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
    const records =
      (id === activeWall
        ? sourceElements
        : feature.properties?.appearance?.facades?.[id]?.elements ||
          generatedFacades[id]?.elements) || [];
    const record = records.find((e: FacadeElement) => e.id === elementId);
    const target =
      record && record.count > 1 ? detailInstanceId(record.id, at) : elementId;
    setWholeRows([]);
    setTouchTool('select');
    setWallId(id);
    setSelected(target ? [target] : []);
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
    if (updateElements([...elements, ...values]))
      setSelected(values.map((e) => e.id));
  };
  const remove = () => {
    const ids = selected.filter((id) => !locked.includes(id));
    if (
      updateElements(
        elements.filter((e) => !ids.includes(e.id)),
        authoring,
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
          : current === 'wall'
            ? 'wall'
            : '3d',
    );
    openPanel(next === 'details' ? 'none' : 'mode');
  };
  const selectTreeTarget = (target: ModelTreeTarget, multi: boolean) => {
    const { kind, partId, wallId, id } = target;
    if (
      kind === 'wall' ||
      kind === 'detail' ||
      kind === 'group' ||
      kind === 'pattern'
    ) {
      if (!wallId) return;
      const previous = activeWall === wallId ? selected : [];
      switchMode('details');
      choose(wallId, kind === 'detail' ? id : undefined);
      if (kind === 'detail' && id) {
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
  const grouped = authoring.groups.some(
    (g) =>
      g.wallId === activeWall &&
      g.members.some((id) =>
        selected.some(
          (s) =>
            s === id ||
            detailInstanceSelection(sourceElements, s).elementId === id,
        ),
      ),
  );
  const ungroupSelection = () =>
    commit({
      ...draft,
      properties: {
        ...draft.properties,
        modelAuthoring: {
          ...authoring,
          groups: authoring.groups.filter(
            (g) =>
              g.wallId !== activeWall ||
              !g.members.some((id) =>
                selected.some(
                  (s) =>
                    s === id ||
                    detailInstanceSelection(sourceElements, s).elementId === id,
                ),
              ),
          ),
        },
      },
    });
  const detachSelectedInstance = () =>
    tryAction(() => {
      if (!active || active.count <= 1 || locked.includes(active.id)) return;
      const next = detachInstance(elements, active.id, instance);
      if (updateElements(next.elements)) {
        setSelected([next.detachedId]);
        setInstance(0);
      }
    });
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
      name: 'Ungroup',
      disabled:
        before || !grouped || selected.some((id) => locked.includes(id)),
      run: ungroupSelection,
    },
    {
      name: 'Detach selected instance',
      disabled:
        before ||
        selected.length !== 1 ||
        !active ||
        active.count <= 1 ||
        locked.includes(active.id),
      run: detachSelectedInstance,
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
    <ModelSurfaceContext
      value={{
        active: tab === 'surface',
        revision: `${mode}:${activeWall}:${selection?.partId || ''}`,
        onFrame: receiveSurfaceFrame,
        onPreview: setSurfacePreview,
      }}
    >
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
              finalFocus={opener || returnFocus}
              positioning="viewport"
              className={`photo-model-workspace model-workspace ${compact ? 'model-compact' : 'model-desktop'} ${landscape ? 'model-landscape' : ''} ${before ? 'model-before' : ''}`}
              data-panel={mobilePanel}
              data-detent={detent}
              data-structure={structureOpen ? 'open' : 'closed'}
              data-mode={mode}
              showCloseButton={false}
              overlayClassName="photo-model-overlay"
              onContextMenu={(e) => {
                if (mode !== 'details' || !(e.target instanceof Element))
                  return;
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
                {!compact && (
                  <ModelButton
                    className="model-back"
                    icon={<ArrowLeft />}
                    onClick={onClose}
                  >
                    Back to Survey
                  </ModelButton>
                )}
                <div>
                  <DialogTitle>
                    {compact ? '' : 'Model editor · '}
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
                  <ModelButton
                    variant="outline"
                    onClick={() => openPanel('walls')}
                    aria-label="Choose wall"
                  >
                    {walls.find((w) => w.wallId === activeWall)?.label ||
                      'Choose wall'}
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    aria-label="Undo"
                    title={
                      workspace?.past.length
                        ? 'Undo (Ctrl+Z)'
                        : 'No changes to undo'
                    }
                    disabled={!workspace?.past.length}
                    onClick={() => {
                      setRoofDraft(null);
                      onHistory?.();
                    }}
                  >
                    ↶
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    aria-label="Redo"
                    title={
                      workspace?.future.length
                        ? 'Redo (Ctrl+Shift+Z)'
                        : 'No changes to redo'
                    }
                    disabled={!workspace?.future.length}
                    onClick={() => {
                      setRoofDraft(null);
                      onHistory?.(true);
                    }}
                  >
                    ↷
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    aria-label="Close workspace"
                    onClick={onClose}
                  >
                    ×
                  </ModelButton>
                </div>
              )}
              <div className="model-toolbar model-main-toolbar">
                <ModelButton
                  icon={<PanelLeft />}
                  aria-expanded={structureOpen}
                  aria-controls="model-structure"
                  onClick={() => setStructureOpen(!structureOpen)}
                >
                  {structureOpen ? 'Hide structure' : 'Show structure'}
                </ModelButton>
                <ToggleGroup
                  aria-label="Building editing mode"
                  value={[mode]}
                  onValueChange={(values) => {
                    if (values[0]) switchMode(values[0] as Mode);
                  }}
                >
                  {(
                    [
                      ['details', Layers],
                      ['appearance', Paintbrush],
                      ['roof', House],
                      ['outline', Pentagon],
                      ['review', ListChecks],
                    ] as const
                  ).map(([m, Icon]) => (
                    <ToggleGroupItem key={m} value={m}>
                      <Icon size={16} />
                      {m[0].toUpperCase() + m.slice(1)}
                      {m === 'review' && publishErrors.length
                        ? ` (${publishErrors.length})`
                        : ''}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <span className="model-toolbar-divider" />
                <ModelButton
                  icon={<Undo2 />}
                  disabled={!onHistory || !workspace?.past.length}
                  title={
                    workspace?.past.length
                      ? 'Undo (Ctrl+Z)'
                      : 'No changes to undo'
                  }
                  onClick={() => {
                    setRoofDraft(null);
                    onHistory?.();
                  }}
                >
                  Undo
                </ModelButton>
                <ModelButton
                  icon={<Redo2 />}
                  disabled={!onHistory || !workspace?.future.length}
                  title={
                    workspace?.future.length
                      ? 'Redo (Ctrl+Shift+Z)'
                      : 'No changes to redo'
                  }
                  onClick={() => {
                    setRoofDraft(null);
                    onHistory?.(true);
                  }}
                >
                  Redo
                </ModelButton>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <ModelButton
                        icon={<MoreHorizontal />}
                        aria-label="Workspace options"
                      />
                    }
                  />
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setBefore((v) => !v)}>
                      <Columns2 />
                      {before ? 'Show changes' : 'Before / after'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setTab('photo');
                        openPanel('none');
                      }}
                    >
                      <Image />
                      Photograph reference
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="model-layout">
                <aside
                  id="model-structure"
                  className="model-hierarchy"
                  aria-label="Building hierarchy"
                >
                  <h3 className="model-panel-title">Structure</h3>
                  <ModelStructureTree
                    nodes={modelTree({
                      name: String(edit.properties.name || 'Building'),
                      topology: buildingTopology(feature),
                      walls,
                      facades: {
                        ...generatedFacades,
                        ...draft.properties.appearance?.facades,
                      },
                      roofTexts: draft.properties.appearance?.roofTexts,
                      authoring,
                      activeWall,
                      elements: sourceElements,
                      locked,
                      hidden,
                    })}
                    selected={
                      mode === 'outline'
                        ? ['footprint']
                        : mode === 'roof' && selection?.partId
                          ? [
                              selection.elementId
                                ? `roof-text:${selection.elementId}`
                                : `roof:${selection.partId}`,
                            ]
                          : mode === 'appearance'
                            ? [
                                selection?.wallId
                                  ? `wall:${selection.wallId}`
                                  : selection?.partId
                                    ? `part:${selection.partId}`
                                    : 'building',
                              ]
                            : selected.length
                              ? selected.map(
                                  (id) => `detail:${activeWall}:${id}`,
                                )
                              : [`wall:${activeWall}`]
                    }
                    onSelect={selectTreeTarget}
                  />
                </aside>
                <main className="model-stage">
                  {mode === 'details' && (
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
                  )}
                  <fieldset
                    className="model-mobile-tabs model-viewport-tabs"
                    aria-label="Workspace view"
                  >
                    <ModelButton
                      icon={<Orbit />}
                      aria-pressed={tab === '3d'}
                      disabled={webglUnavailable}
                      title={
                        webglUnavailable
                          ? '3D unavailable on this device; use 2D precision'
                          : 'Orbit the model'
                      }
                      onClick={() => {
                        setTab('3d');
                        openPanel('none');
                      }}
                    >
                      Orbit
                    </ModelButton>
                    <ModelButton
                      icon={<ScanFace />}
                      aria-pressed={tab === 'surface'}
                      disabled={
                        before ||
                        webglUnavailable ||
                        !['details', 'roof', 'outline'].includes(mode)
                      }
                      title={
                        !['details', 'roof', 'outline'].includes(mode)
                          ? 'Select a wall, roof, or footprint to edit its surface'
                          : 'Align the model and edit this surface'
                      }
                      onClick={() => {
                        setTab('surface');
                        openPanel('none');
                      }}
                    >
                      Edit surface
                    </ModelButton>
                    <ModelButton
                      icon={<Ruler />}
                      aria-pressed={tab === 'wall'}
                      disabled={!['details', 'roof', 'outline'].includes(mode)}
                      onClick={() => {
                        setTab('wall');
                        openPanel('none');
                      }}
                    >
                      2D precision
                    </ModelButton>
                    <ModelButton
                      icon={<Image />}
                      aria-pressed={tab === 'photo'}
                      onClick={() => {
                        setTab('photo');
                        openPanel('none');
                      }}
                    >
                      Photo
                    </ModelButton>
                  </fieldset>
                  {selected.length > 0 && (
                    <div
                      className="model-selected-actions"
                      aria-label="Selected item actions"
                    >
                      {selectionActions}
                      <span>
                        {selected.length === 1 && active
                          ? label(active)
                          : `${selected.length} selected`}
                      </span>
                      {grouped && (
                        <ModelButton
                          icon={<Ungroup />}
                          disabled={
                            before || selected.some((id) => locked.includes(id))
                          }
                          onClick={ungroupSelection}
                        >
                          Ungroup
                        </ModelButton>
                      )}
                      {selected.length === 1 && active && active.count > 1 && (
                        <ModelButton
                          icon={<Split />}
                          disabled={before || locked.includes(active.id)}
                          onClick={detachSelectedInstance}
                        >
                          Detach instance
                        </ModelButton>
                      )}
                    </div>
                  )}
                  {webglUnavailable && (
                    <p className="small-note">
                      3D is unavailable. Continue editing with 2D precision;
                      your draft is retained.
                    </p>
                  )}
                  <div className={`model-view-columns model-tab-${tab}`}>
                    <div
                      ref={setPlanHost}
                      className="model-plan-host"
                      hidden={
                        !['wall', 'surface'].includes(tab) ||
                        !['details', 'roof', 'outline'].includes(mode)
                      }
                    />
                    <div className="model-3d-view">
                      <PhotoModelPreview
                        onActions={showContextActions}
                        active={tab === '3d' || tab === 'surface'}
                        surfaceEditing={tab === 'surface'}
                        surface={surfaceFrame}
                        onUnavailable={() => {
                          setWebglUnavailable(true);
                          setTab('wall');
                        }}
                        hidden={hidden}
                        feature={renderedFeature}
                        visual={visual}
                        data={data}
                        wallId={activeWall}
                        selection={
                          mode !== 'details' && mode !== 'review'
                            ? selection || { buildingId: edit.id }
                            : {
                                buildingId: edit.id,
                                wallId: activeWall,
                                ...(surfacePreview &&
                                'elements' in surfacePreview
                                  ? {
                                      elementId:
                                        selected.length === 1
                                          ? selected[0]
                                          : undefined,
                                    }
                                  : detailInstanceSelection(
                                      sourceElements,
                                      selected.length === 1
                                        ? selected[0]
                                        : undefined,
                                    )),
                              }
                        }
                        onSelect={(s) => {
                          if (s.wallId) {
                            setMode('details');
                            choose(s.wallId, s.elementId, s.instanceIndex);
                          } else if (s.partId) {
                            setSelected([]);
                            onSelection(s);
                            switchMode(
                              s.role === 'roof' ? 'roof' : 'appearance',
                            );
                          }
                        }}
                      />
                    </div>
                    <div className="model-photo-view">
                      <ModelButton
                        variant="outline"
                        aria-expanded={reference}
                        onClick={() => setReference((v) => !v)}
                      >
                        {reference ? 'Hide' : 'Show'} photograph reference
                      </ModelButton>
                      {(reference || compact || tab === 'photo') && (
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
                  <div className="model-property-target">
                    <h3 className="model-panel-title">Properties</h3>
                    <p>
                      {mode === 'details'
                        ? selected.length
                          ? `${selected.length} selected · ${active ? label(active) : 'Details'}`
                          : walls.find((w) => w.wallId === activeWall)?.label ||
                            'Choose a wall'
                        : mode === 'outline'
                          ? 'Building footprint'
                          : mode === 'review'
                            ? 'Building review'
                            : selection?.wallId
                              ? walls.find((w) => w.wallId === selection.wallId)
                                  ?.label
                              : selection?.partId
                                ? `Wing ${buildingTopology(feature).parts.findIndex((p) => p.id === selection.partId) + 1} · ${mode === 'roof' ? (selection.elementId ? 'Roof text' : 'Roof') : 'defaults'}`
                                : 'Whole building · defaults'}
                    </p>
                  </div>
                  <div className="model-canvas-controller">
                    {mode === 'details' && metrics && (
                      <>
                        {!recorded && !conversion && (
                          <div className="model-notice">
                            <p>
                              Adding a detail preserves this wall’s generated
                              layout. You can also preview and convert it before
                              editing.
                            </p>
                            <ModelButton
                              variant="outline"
                              onClick={() =>
                                tryAction(() =>
                                  setConversion(
                                    editableFacade(feature, activeWall, visual),
                                  ),
                                )
                              }
                            >
                              Preview editable layout
                            </ModelButton>
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
                            <ModelButton
                              variant="outline"
                              icon={<ActionCheck />}
                              onClick={() => applyWall(conversion)}
                            >
                              Use editable layout
                            </ModelButton>
                            <ModelButton
                              variant="outline"
                              icon={<ActionX />}
                              onClick={() => setConversion(null)}
                            >
                              Cancel conversion
                            </ModelButton>
                          </div>
                        )}
                        {pending?.wallId === activeWall && (
                          <div className="model-notice">
                            <p>
                              Unfinished wall retained locally. Resolve its
                              placement or building errors, then save it.
                            </p>
                            <ModelButton
                              variant="outline"
                              onClick={() => applyWall(pending)}
                            >
                              Save unfinished wall
                            </ModelButton>
                            <ModelButton
                              variant="outline"
                              onClick={() => switchMode('appearance')}
                            >
                              Check building height
                            </ModelButton>
                          </div>
                        )}
                        <ModelPlanPortal>
                          <ModelWallCanvas
                            interactive={
                              ['wall', 'surface'].includes(tab) &&
                              (!compact || landscape || panel === 'none')
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
                        </ModelPlanPortal>
                      </>
                    )}
                  </div>
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
                          setSelected([]);
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
                    <section className="model-review" data-mobile-panel="mode">
                      <h3>Model review</h3>
                      <p>
                        Saving preserves your draft. Only walls explicitly
                        reviewed receive approval.
                      </p>
                      <p>
                        Editing details clears that wall’s previous review.
                        “Needs review” does not by itself mean the model is
                        broken. Inspect its placement and evidence, then mark
                        that wall reviewed to enable a release preview.
                      </p>
                      {publishErrors.map((e, i) => (
                        <ModelButton
                          variant="outline"
                          key={i}
                          onClick={() => {
                            const issue = facadeReviewIssues(feature).find(
                              (issue) => issue.message === e,
                            );
                            if (
                              issue &&
                              !walls.some((w) => w.wallId === issue.field)
                            ) {
                              setError(
                                'This wall was removed or reassigned. Use its rematching controls below to choose an empty wall.',
                              );
                              return;
                            }
                            if (
                              issue?.field &&
                              walls.some((w) => w.wallId === issue.field)
                            )
                              choose(issue.field);
                            switchMode(
                              /height|floor/i.test(e)
                                ? 'appearance'
                                : 'details',
                            );
                            if (!/height|floor/i.test(e)) {
                              setReviewOpen(true);
                              openPanel('more');
                              setDetent('full');
                            }
                          }}
                        >
                          {e}
                        </ModelButton>
                      ))}
                      {Object.values(
                        draft.properties.appearance?.facades || {},
                      ).map((f) => {
                        const w = walls.find((w) => w.wallId === f.wallId),
                          changed =
                            JSON.stringify(
                              initial.current.properties.appearance?.facades?.[
                                f.wallId
                              ],
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
                              {f.reviewedAt &&
                              !f.needsReview &&
                              facadeMatches(f, feature)
                                ? 'Reviewed'
                                : 'Needs review'}
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
                                      ]?.elements.some((old) => old.id === e.id)
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
                            <ModelButton
                              variant="outline"
                              onClick={() => {
                                choose(w?.wallId || activeWall);
                                setMode('details');
                                setReviewOpen(true);
                                openPanel('more');
                                setDetent('full');
                                setTab((view) =>
                                  view === 'surface' ? view : 'wall',
                                );
                              }}
                            >
                              Inspect details and evidence
                            </ModelButton>
                            {!w && metrics && (
                              <ModelButton
                                variant="outline"
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
                              </ModelButton>
                            )}
                          </article>
                        );
                      })}
                      {!Object.keys(draft.properties.appearance?.facades || {})
                        .length && <p>No custom wall details yet.</p>}
                    </section>
                  )}
                  {compact && panel === 'more' && mode === 'details' && (
                    <div className="model-more-shortcuts">
                      <ModelButton
                        variant="outline"
                        onClick={() => {
                          setBefore((v) => !v);
                          openPanel('none');
                        }}
                      >
                        {before ? 'Show changes' : 'Before / after'}
                      </ModelButton>
                      <ModelButton
                        variant="outline"
                        onClick={() => {
                          openPanel('walls');
                          setTouchTool('multi');
                        }}
                      >
                        Multi-select
                      </ModelButton>
                      {!recorded && !conversion && (
                        <ModelButton
                          variant="outline"
                          onClick={() => {
                            tryAction(() =>
                              setConversion(
                                editableFacade(feature, activeWall, visual),
                              ),
                            );
                            openPanel('more');
                          }}
                        >
                          Preview editable layout
                        </ModelButton>
                      )}
                      {unsaved && (
                        <ModelButton
                          variant="outline"
                          icon={<ActionRotateCcw />}
                          onClick={discardInput}
                        >
                          Discard unfinished input
                        </ModelButton>
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
                          <ModelButton
                            variant="outline"
                            icon={<ActionPlus />}
                            key={k}
                            disabled={before}
                            onClick={() => {
                              add(k);
                              if (compact) {
                                setTab((view) =>
                                  view === 'surface' ? view : 'wall',
                                );
                                openPanel('none');
                              }
                            }}
                          >
                            Add {k}
                          </ModelButton>
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
                            <ModelButton
                              variant="outline"
                              key={action}
                              onClick={() =>
                                updateElements(
                                  layoutElements(
                                    elements,
                                    selected.filter(
                                      (id) => !locked.includes(id),
                                    ),
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
                            </ModelButton>
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
                                      textWeight: e.target.value as
                                        | 'regular'
                                        | 'bold',
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
                                      textAlign: e.target.value as
                                        | 'left'
                                        | 'center'
                                        | 'right',
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
                            {field(
                              'count',
                              'Repeat count',
                              active.count,
                              1,
                              40,
                            )}
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
                            {elementBounds(
                              active,
                              metrics.length,
                            ).right.toFixed(2)}{' '}
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
                              !grouped ||
                              before ||
                              selected.some((id) => locked.includes(id))
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
                                      { id: crypto.randomUUID(), ...stamp() },
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
                        <ModelButton variant="outline" onClick={editPattern}>
                          {patternId ? 'Update pattern' : 'Create pattern'}
                        </ModelButton>
                        <ModelButton
                          variant="outline"
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
                                                !selected.includes(
                                                  v.members[i],
                                                ),
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
                        </ModelButton>
                        {(workspace?.edits || [draft]).flatMap((e) =>
                          (e.properties.modelAuthoring?.presets || []).map(
                            (p) => (
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
                            ),
                          ),
                        )}
                      </details>
                      {facade && (
                        <details
                          className="model-wall-review"
                          open={reviewOpen || !!facade.needsReview}
                          onToggle={(e) => setReviewOpen(e.currentTarget.open)}
                        >
                          <summary>Evidence &amp; wall review</summary>
                          <p>
                            {facade.reviewedAt &&
                            !facade.needsReview &&
                            facadeMatches(facade, feature)
                              ? 'This wall is reviewed. Another detail edit will require a fresh review.'
                              : 'Review required before preview. Check this wall’s placement and evidence, then mark only this wall reviewed.'}
                          </p>
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
                            <ModelButton
                              variant="outline"
                              icon={<ActionCheck />}
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
                            </ModelButton>
                          )}
                          {facade.photoIds.map((id) => (
                            <p key={id}>
                              {photos.find((p) => p.id === id)?.caption ||
                                'Unavailable photo'}{' '}
                              <ModelButton
                                variant="destructive"
                                icon={<ActionTrash2 />}
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
                              </ModelButton>
                            </p>
                          ))}
                          {!facadeMatches(facade, feature) && (
                            <ModelButton
                              variant="outline"
                              onClick={() => {
                                const length = wallLength(
                                  facade.wallCoordinates,
                                );
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
                            </ModelButton>
                          )}
                          <ModelButton
                            variant="outline"
                            icon={<ActionCheck />}
                            disabled={!facadeMatches(facade, feature)}
                            onClick={() =>
                              applyWall(
                                { ...facade, needsReview: false },
                                authoring,
                                true,
                              )
                            }
                          >
                            Mark this wall reviewed
                          </ModelButton>
                          <ModelButton
                            variant="outline"
                            icon={<ActionRotateCcw />}
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
                          </ModelButton>
                        </details>
                      )}
                    </>
                  )}
                  {mode !== 'details' && (
                    <p>
                      Select Details to edit individual architectural elements.
                      Roof and footprint changes may require another wall
                      review.
                    </p>
                  )}
                </aside>
              </div>
              {compact && (
                <>
                  {mobilePanel !== 'none' && (
                    <div className="model-sheet-heading">
                      {landscape && (
                        <nav
                          className="model-panel-tabs"
                          aria-label="Editing panel"
                        >
                          <ModelButton
                            variant="outline"
                            aria-pressed={mobilePanel === 'walls'}
                            onClick={() => openPanel('walls')}
                          >
                            Structure
                          </ModelButton>
                          <ModelButton
                            variant="outline"
                            aria-pressed={mobilePanel !== 'walls'}
                            onClick={() =>
                              openPanel(mode === 'details' ? 'edit' : 'mode')
                            }
                          >
                            Properties
                          </ModelButton>
                        </nav>
                      )}
                      <ModelButton
                        variant="outline"
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
                      </ModelButton>
                      <ModelButton
                        variant="outline"
                        className="model-sheet-done"
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
                      </ModelButton>
                    </div>
                  )}
                  {error && (
                    <div role="alert" className="model-mobile-alert">
                      <ModelButton
                        variant="outline"
                        className="model-mobile-error"
                        onClick={() => switchMode('review')}
                      >
                        {error}
                      </ModelButton>
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
                        ? tab === '3d'
                          ? 'Tap to select · hold a detail for actions'
                          : 'Tap to select'
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
                          <ModelButton
                            variant="outline"
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
                              setTab((view) =>
                                view === 'surface' ? view : 'wall',
                              );
                            }}
                          >
                            Move
                          </ModelButton>
                          <ModelButton
                            variant="outline"
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
                              setTab((view) =>
                                view === 'surface' ? view : 'wall',
                              );
                            }}
                          >
                            Resize
                          </ModelButton>
                          <ModelButton
                            variant="outline"
                            onClick={() => openPanel('edit')}
                          >
                            Edit
                          </ModelButton>
                        </>
                      ) : (
                        <>
                          <ModelButton
                            variant="outline"
                            disabled={before}
                            onClick={() => openPanel('add')}
                          >
                            Add
                          </ModelButton>
                          <ModelButton
                            variant="outline"
                            onClick={() => openPanel('walls')}
                          >
                            Walls
                          </ModelButton>
                          <ModelButton
                            variant="outline"
                            aria-pressed={touchTool === 'multi'}
                            onClick={() => {
                              openPanel('walls');
                              setTouchTool('multi');
                            }}
                          >
                            Multi-select
                          </ModelButton>
                        </>
                      )
                    ) : (
                      <>
                        <ModelButton
                          variant="outline"
                          onClick={() => openPanel('mode')}
                        >
                          {mode === 'review' ? 'Review issues' : 'Edit ' + mode}
                        </ModelButton>
                        <ModelButton
                          variant="outline"
                          onClick={() => {
                            openPanel('none');
                            setTouchTool(
                              touchTool === 'move' ? 'select' : 'move',
                            );
                            setTab((view) =>
                              view === 'surface' ? view : 'wall',
                            );
                          }}
                          disabled={!['roof', 'outline'].includes(mode)}
                          aria-pressed={touchTool === 'move'}
                        >
                          Move point
                        </ModelButton>
                        <ModelButton
                          variant="outline"
                          onClick={() => openPanel('walls')}
                        >
                          Walls
                        </ModelButton>
                      </>
                    )}
                    <ModelButton
                      variant="outline"
                      onClick={() =>
                        openPanel(tab === 'photo' ? 'photo' : 'more')
                      }
                    >
                      More
                    </ModelButton>
                  </nav>
                  {mobilePanel === 'more' && mode !== 'details' && (
                    <section data-mobile-panel="more">
                      <ModelButton
                        variant="outline"
                        onClick={() => {
                          setBefore((v) => !v);
                          openPanel('none');
                        }}
                      >
                        Before / after
                      </ModelButton>
                      <ModelButton
                        variant="outline"
                        onClick={() => switchMode('details')}
                      >
                        Edit architectural details
                      </ModelButton>
                      <ModelButton
                        variant="outline"
                        onClick={() => switchMode('review')}
                      >
                        Review changes
                      </ModelButton>
                      {unsaved && (
                        <ModelButton
                          variant="outline"
                          icon={<ActionRotateCcw />}
                          onClick={discardInput}
                        >
                          Discard unfinished input
                        </ModelButton>
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
                          setPasteTransform((t) => ({
                            ...t,
                            [key]: Number(v),
                          }));
                          return true;
                        }}
                      />
                    ))}
                  </div>
                  <p>
                    Dimensions and spacing stay in metres. New placements
                    require owner review.
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
                    {(paste.elements[0]?.x * paste.wallLength).toFixed(2)} m
                    from A; height {paste.elements[0]?.bottom.toFixed(2)} m.
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
                  <ModelButton variant="outline" onClick={confirmPaste}>
                    Confirm placement
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    icon={<ActionX />}
                    onClick={() => setPaste(null)}
                  >
                    Cancel copy
                  </ModelButton>
                </section>
              )}
              <footer>
                {error && <p role="alert">{error}</p>}
                <span>
                  Draft changes save automatically. Publication requires release
                  review.
                </span>
                {unsaved && (
                  <ModelButton
                    variant="outline"
                    icon={<ActionRotateCcw />}
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
                  </ModelButton>
                )}
                <ModelButton
                  variant="outline"
                  icon={<ActionX />}
                  onClick={onClose}
                >
                  Close workspace
                </ModelButton>
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
                      ? shell.current?.querySelector<HTMLElement>(target) ||
                          true
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
                        action.name === 'Delete'
                          ? 'model-menu-danger'
                          : undefined
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
    </ModelSurfaceContext>
  );
}
