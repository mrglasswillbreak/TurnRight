import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useGroupRef } from 'react-resizable-panels';
import type { MeshSelection, ModelDocument } from './model-document';
import {
  useCompactModel,
  useLandscapeModel,
  useModelMedia,
  type ModelPanel,
  type ModelTouchTool,
} from './model-mobile';
import type { ModelPreviewScene } from './model-preview-scene';
import { type SurfaceFrame, type SurfacePreview } from './model-surface';
import { Mode, Stamp, WorkspaceProps } from './model-workspace-shared';
import { type WallView } from './ModelWallCanvas';
import { useModelReference } from './use-model-reference';
import type {
  FacadeDescription,
  ModelAuthoring,
  RoofDraft,
} from './visual-types';
import { useFrameLayout, useWorkspaceLayout } from './WorkspaceFrame';

export function useModelWorkspaceState({
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
  const parentLayout = useFrameLayout();
  const localLayout = useWorkspaceLayout('local-model', 'standalone');
  const modelLayout = parentLayout || localLayout;
  const savedModelLayout = modelLayout.value.sizes['model:desktop'];
  const modelDefaultLayout = useRef(
    savedModelLayout?.structure && savedModelLayout.properties
      ? {
          structure: savedModelLayout.structure,
          properties: savedModelLayout.properties,
          model: Math.max(
            1,
            100 - savedModelLayout.structure - savedModelLayout.properties,
          ),
        }
      : undefined,
  );
  const modelPanels = useGroupRef();
  const modelPanelsElement = useRef<HTMLDivElement>(null);
  const modelPanelsInitialized = useRef(false);
  const [propertiesOpen, setPropertiesPreference] = useState(
    () => !modelLayout.value.collapsed['model:desktop:right'],
  );
  const setPropertiesOpen = (value: boolean) => {
    setPropertiesPreference(value);
    modelLayout.update((old) => ({
      ...old,
      collapsed: { ...old.collapsed, 'model:desktop:right': !value },
    }));
  };
  const modelSizes = useRef(modelLayout.value.sizes['model:desktop']);
  modelSizes.current = modelLayout.value.sizes['model:desktop'];

  const landscape = useLandscapeModel() && compact;
  const wide = useModelMedia('(min-width: 1200px)');
  const [structurePreference, setStructurePreference] = useState<
    boolean | null
  >(() =>
    typeof modelLayout.value.collapsed['model:desktop:left'] === 'boolean'
      ? !modelLayout.value.collapsed['model:desktop:left']
      : null,
  );
  const setStructureOpen = (value: boolean | null) => {
    setStructurePreference(value);
    if (value !== null)
      modelLayout.update((old) => ({
        ...old,
        collapsed: { ...old.collapsed, 'model:desktop:left': !value },
      }));
  };
  const structureOpen = structurePreference ?? wide;
  useLayoutEffect(() => {
    modelPanelsInitialized.current = false;
    if (compact) return;
    const frame = requestAnimationFrame(() => {
      const width = Math.max(
        1,
        (modelPanelsElement.current?.clientWidth || innerWidth) - 10,
      );
      const structure = structureOpen
        ? modelSizes.current?.structure || (260 / width) * 100
        : 0;
      const properties = propertiesOpen
        ? modelSizes.current?.properties || (320 / width) * 100
        : 0;
      modelPanels.current?.setLayout({
        structure,
        model: Math.max(1, 100 - structure - properties),
        properties,
      });
      modelPanelsInitialized.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    compact,
    structureOpen,
    propertiesOpen,
    modelLayout.resetRevision,
    modelPanels,
  ]);
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
    if (!compact || panel === 'none') return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => {
      // A user may already have focused a tree row or field before this frame.
      // Do not redirect their next keystroke to the sheet handle.
      if (
        document.activeElement !== previous &&
        shell.current?.contains(document.activeElement)
      )
        return;
      shell.current
        ?.querySelector<HTMLButtonElement>(
          landscape ? '.model-panel-tabs button' : '.model-sheet-handle',
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
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
    [selectionKeys, setSelected] = useState<string[]>([]),
    [instance, setInstance] = useState(0);
  const [tab, setTab] = useState('3d'),
    [before, setBefore] = useState(false),
    [error, setError] = useState(''),
    [grid, setGrid] = useState(0.1);
  const referenceLayout = useModelReference();
  const [meshPreview, setMeshPreview] = useState<ModelDocument | null>(null);
  const [meshSelection, setMeshSelection] = useState<MeshSelection | null>(
    null,
  );
  const [previewScene, setPreviewScene] = useState<ModelPreviewScene | null>(
    null,
  );
  // Photo remains a full-screen option when the remembered split cannot fit.
  useEffect(() => {
    if (referenceLayout.active && tab === 'photo') setTab('3d');
  }, [referenceLayout.active, tab]);
  const [wholeRows, setWholeRows] = useState<string[]>([]);
  const [reviewResult, setReviewResult] = useState('');
  const [hiddenItems, setHidden] = useState<string[]>([]),
    [lockedItems, setLocked] = useState<string[]>([]),
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
  return {
    edit,
    data,
    selection,
    onSelection,
    onEdit,
    onClose,
    opener,
    workspace,
    onHistory,
    compact,
    modelLayout,
    modelDefaultLayout,
    modelPanels,
    modelPanelsElement,
    modelPanelsInitialized,
    propertiesOpen,
    setPropertiesOpen,
    landscape,
    setStructureOpen,
    structureOpen,
    actionMenuOpen,
    setActionMenuOpen,
    reviewOpen,
    setReviewOpen,
    actionFocus,
    contextReturn,
    contextPoint,
    setContextPoint,
    panel,
    detent,
    setDetent,
    touchTool,
    setTouchTool,
    planHost,
    setPlanHost,
    shell,
    sheetStart,
    sheetDragged,
    openPanel,
    initial,
    returnFocus,
    wallViews,
    local,
    setLocal,
    mode,
    setMode,
    wallId,
    setWallId,
    selectionKeys,
    setSelected,
    instance,
    setInstance,
    tab,
    setTab,
    before,
    setBefore,
    error,
    setError,
    grid,
    setGrid,
    referenceLayout,
    meshPreview,
    setMeshPreview,
    meshSelection,
    setMeshSelection,
    previewScene,
    setPreviewScene,
    wholeRows,
    setWholeRows,
    reviewResult,
    setReviewResult,
    hiddenItems,
    setHidden,
    lockedItems,
    setLocked,
    clipboard,
    setClipboard,
    paste,
    setPaste,
    pending,
    setPending,
    pendingAuthoring,
    setPendingAuthoring,
    name,
    setName,
    pattern,
    setPattern,
    patternId,
    setPatternId,
    targetBuilding,
    setTargetBuilding,
    targetWall,
    setTargetWall,
    roofDraft,
    setRoofDraft,
    reference,
    setReference,
    photoId,
    setPhotoId,
    surfaceFrame,
    surfacePreview,
    setSurfacePreview,
    webglUnavailable,
    setWebglUnavailable,
    receiveSurfaceFrame,
    conversion,
    setConversion,
    pasteTransform,
    setPasteTransform,
  };
}
export type ModelWorkspaceStateBindings = ReturnType<
  typeof useModelWorkspaceState
>;
