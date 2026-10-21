import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  campusLayers,
  layerFeatures,
  layerMembership,
  layerEdit,
  editableLayer,
} from './campus-layers';
import type { CampusData, MapEdit } from './types';
import type {
  CampusLayer,
  LayerViewState,
  LayerStyle,
  LayerRole,
} from './campus-layer-types';
import { featureEdit } from './editor-features';
import { surfaceStale } from './surface-generation';
import { propertyEdits } from './road-properties';
import {
  BUILDING_PRESETS,
  presetEdit,
  type BuildingPreset,
} from './building-presets';

import { createLayerTreeRenderer } from './createLayerTreeRenderer';
import type { ValidationIssue } from './validation';
export type LayerWorkspaceProps = {
  data: CampusData;
  issues: ValidationIssue[];
  edits: MapEdit[];
  view: LayerViewState;
  onView: (value: LayerViewState) => void;
  onCommit: (edits: MapEdit[]) => void;
  onAppearancePreview: (edits: MapEdit[] | null) => void;
  onSelect: (kind: MapEdit['kind'], id: string) => void;
  onZoom: (ids: string[]) => void;
  onImport: () => void;
  onDraw: (
    layer: CampusLayer,
    type: 'Point' | 'LineString' | 'Polygon',
  ) => void;
  onGeometry: (
    operation:
      | 'merge'
      | 'split'
      | 'hole'
      | 'regenerate'
      | 'square'
      | 'straighten'
      | 'align'
      | 'offset',
    keys: string[],
  ) => void;
  onClose: () => void;
};
export function useLayerWorkspace({
  data,
  issues,
  edits,
  view,
  onView,
  onCommit,
  onSelect,
  onZoom,
  onImport,
  onDraw,
  onGeometry,
  onAppearancePreview,
  onClose,
}: LayerWorkspaceProps) {
  const items = useMemo(() => campusLayers(data).items, [data]),
    features = useMemo(() => layerFeatures(data), [data]),
    membership = useMemo(() => layerMembership(data, items), [data, items]);

  const active = items.find((l) => l.id === view.active);

  const table = useRef<HTMLDivElement>(null);

  const featureSearch = useRef<HTMLInputElement>(null);

  const featureIndex = useMemo(
    () => new Map(features.map((f) => [f.key, f])),
    [features],
  );

  const layerStats = useMemo(() => {
    const stats = new Map<string, { count: number; geometry: Set<string> }>();
    for (const f of features) {
      const id = membership.get(f.key) || '';
      const entry = stats.get(id) || { count: 0, geometry: new Set<string>() };
      entry.count++;
      entry.geometry.add(f.geometry.type);
      stats.set(id, entry);
    }
    return stats;
  }, [features, membership]);

  const layerIssues = useMemo(() => {
    const result = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
      const id = membership.get(`${issue.featureKind}:${issue.featureId}`);
      if (id) result.set(id, [...(result.get(id) || []), issue]);
    }
    return result;
  }, [issues, membership]);

  const [explorerTab, setExplorerTab] = useState<'layers' | 'features'>(
    'layers',
  );

  // On compact screens the attribute sheet replaces the explorer. Move focus
  // into that sheet instead of leaving it on a tab that is now hidden.
  useEffect(() => {
    if (
      explorerTab !== 'features' ||
      !matchMedia('(max-width: 1199px)').matches
    )
      return;
    const frame = requestAnimationFrame(() => featureSearch.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [explorerTab]);

  const [draft, setDraft] = useState<CampusLayer | null>(null),
    [query, setQuery] = useState(''),
    [featureQuery, setFeatureQuery] = useState(''),
    [scroll, setScroll] = useState(0),
    [message, setMessage] = useState('');

  const [createName, setCreateName] = useState(''),
    [createRole, setCreateRole] = useState<LayerRole>('overlay'),
    [bulk, setBulk] = useState({ field: 'surface', value: '' }),
    [pending, setPending] = useState<MapEdit[] | null>(null),
    [pendingBase, setPendingBase] = useState<{
      data: CampusData;
      edits: MapEdit[];
    } | null>(null),
    [moveTarget, setMoveTarget] = useState('');

  const selected = view.selected || [];

  const [preset, setPreset] = useState<BuildingPreset>('limestone');

  const [pendingLabel, setPendingLabel] = useState('');

  const previewPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      previewPanel.current?.focus({ preventScroll: true });
      previewPanel.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [pending]);

  useEffect(() => {
    onAppearancePreview(
      pendingLabel && pendingBase?.data === data && pendingBase?.edits === edits
        ? pending
        : null,
    );
    return () => onAppearancePreview(null);
  }, [pendingLabel, pendingBase, pending, data, edits, onAppearancePreview]);

  const previewAppearance = () => {
    if (!selectionEditable()) return;
    try {
      if (selected.length > 500)
        throw new Error('Select up to 500 buildings per appearance edit.');
      const batch = selected.map((key) => {
        const f = featureIndex.get(key);
        const edit =
          f &&
          f.kind === 'building' &&
          featureEdit(data, 'building', f.id, edits);
        if (!edit) throw new Error('Select building rows only.');
        return presetEdit(edit, preset);
      });
      setPendingLabel(
        `${BUILDING_PRESETS[preset].name}: illustrative colours across ${batch.length} ${batch.length === 1 ? 'building' : 'buildings'}. Heights, custom roofs and individual wall styles are retained.`,
      );
      setPendingBase({ data, edits });
      setPending(batch);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const selectedKeys = useMemo(
    () => new Set(view.selected || []),
    [view.selected],
  );

  const setSelected = (value: string[] | ((current: string[]) => string[])) =>
    onView({
      ...view,
      selected: typeof value === 'function' ? value(selected) : value,
    });

  // Validation/autosave can replace CampusData without changing this layer.
  // Do not reset an in-progress settings form for those unrelated rerenders.
  const activeSignature = active ? JSON.stringify(active) : '';

  useEffect(() => {
    setDraft(activeSignature ? JSON.parse(activeSignature) : null);
    setMessage('');
  }, [activeSignature]);

  // Reset the DOM scroller as well as the virtual window; changing just React
  // state leaves filtered results thousands of pixels above the visible rows.
  useLayoutEffect(() => {
    if (table.current) table.current.scrollTop = 0;
    setScroll(0);
  }, [view.active, featureQuery, explorerTab]);

  const descendants = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const item of items) {
      if (item.parentId)
        children.set(item.parentId, [
          ...(children.get(item.parentId) || []),
          item.id,
        ]);
    }
    const visit = (id: string): string[] => [
      id,
      ...(children.get(id) || []).flatMap(visit),
    ];
    return visit;
  }, [items]);

  const activeIds = useMemo(
    () => new Set(view.active ? descendants(view.active) : []),
    [view.active, descendants],
  );

  const searchIndex = useMemo(
    () =>
      new Map(
        features.map((f) => [
          f.key,
          `${f.properties.name || ''} ${f.id} ${f.properties.sourceId || ''} ${f.properties.surface || ''} ${f.properties.landClass || ''}`.toLowerCase(),
        ]),
      ),
    [features],
  );

  const rows = useMemo(
    () =>
      features.filter(
        (f) =>
          (!active || activeIds.has(membership.get(f.key) || '')) &&
          searchIndex.get(f.key)!.includes(featureQuery.toLowerCase()),
      ),
    [features, active, activeIds, membership, searchIndex, featureQuery],
  );

  const staleCount = useMemo(
    () =>
      rows.filter((f) => surfaceStale(f.properties, data.map.features)).length,
    [rows, data.map.features],
  );

  const save = (layers: CampusLayer[]) =>
    onCommit(
      layers.map((l) =>
        layerEdit(
          l,
          edits.find((e) => e.kind === 'layer' && e.id === l.id),
        ),
      ),
    );

  const update = (patch: Partial<CampusLayer>) =>
    setDraft((d) => (d ? { ...d, ...patch } : null));

  const style = (patch: Partial<LayerStyle>) =>
    setDraft((d) => (d ? { ...d, style: { ...d.style, ...patch } } : null));

  const previewBulk = () => {
    setPendingLabel('');
    if (!selectionEditable()) return;
    const changes = selected
      .map((key) => featureIndex.get(key))
      .filter(
        (f): f is import('./campus-layers').LayerFeature =>
          !!f && f.kind !== 'boundary',
      )
      .map((f) => featureEdit(data, f.kind as MapEdit['kind'], f.id, edits))
      .filter((e) => !!e);
    if (changes.length > 500) {
      setMessage('Select up to 500 features per atomic edit.');
      return;
    }
    if (!changes.length) return;
    const unsupported = changes.some(
      (e) =>
        ['surface', 'landClass', 'highway', 'width'].includes(bulk.field) &&
        !['land', 'overlay', 'path'].includes(e.kind),
    );
    if (unsupported) {
      setMessage(
        'These road/land fields apply only to paths, landscape and overlays.',
      );
      return;
    }
    const batch = propertyEdits(
      data,
      edits,
      changes,
      bulk.field,
      bulk.field === 'width' ? Number(bulk.value) : bulk.value,
    );
    if (batch.length > 500) {
      setMessage(
        'Linked roads bring this operation above 500 changes. Select fewer features.',
      );
      return;
    }
    setPendingBase({ data, edits });
    setPending(batch);
  };

  const selectionEditable = () => {
    if (selected.includes('boundary:campus-boundary')) {
      setMessage(
        'The campus boundary is managed in Campus settings. Select only editable feature rows.',
      );
      return false;
    }
    if (
      selected.some((key) => {
        const l = items.find((l) => l.id === membership.get(key));
        return l && !editableLayer(l, items);
      })
    ) {
      setMessage('Show and unlock all selected layers before editing.');
      return false;
    }
    return true;
  };

  const exportLayer = () => {
    const allowed = new Set([
      'id',
      'kind',
      'name',
      'sourceId',
      'importLayer',
      'mapLayerId',
      'highway',
      'surface',
      'width',
      'widthEvidence',
      'widthSource',
      'landClass',
      'landUse',
      'vegetation',
      'label',
      'color',
      'opacity',
      'height',
      'floors',
    ]);
    const content = {
      type: 'FeatureCollection',
      name: active?.name || 'Campus layers',
      attribution: data.sources.map((s) => ({
        name: s.name,
        attribution: s.attribution,
        license: s.license,
      })),
      features: rows.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: Object.fromEntries(
          Object.entries(f.properties).filter(([key]) => allowed.has(key)),
        ),
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(content)], { type: 'application/geo+json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(active?.name || 'campus-layers').replace(/[^\w.-]+/g, '-')}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const move = () => {
    setPendingLabel('');
    if (!selectionEditable()) return;
    const target = items.find((l) => l.id === moveTarget);
    if (!target || !editableLayer(target, items)) {
      setMessage('Select an editable target layer.');
      return;
    }
    const keys = new Set(selected);
    const changed = items
      .filter((l) => l.members.some((k) => keys.has(k)) || l.id === target.id)
      .map((l) => ({
        ...l,
        members:
          l.id === target.id
            ? [...new Set([...l.members, ...selected])]
            : l.members.filter((k) => !keys.has(k)),
      }));
    setPendingBase({ data, edits });
    setPending(
      changed.map((l) =>
        layerEdit(
          l,
          edits.find((e) => e.kind === 'layer' && e.id === l.id),
        ),
      ),
    );
  };
  const row = createLayerTreeRenderer({
    view,
    items,
    descendants,
    setMessage,
    save,
    onView,
    layerStats,
    edits,
    layerIssues,
  });

  const first = Math.max(
      0,
      Math.min(rows.length - 1, Math.floor(scroll / 44) - 4),
    ),
    last = Math.min(rows.length, first + 22);
  return {
    onClose,
    explorerTab,
    setExplorerTab,
    rows,
    onImport,
    onView,
    view,
    query,
    setQuery,
    items,
    descendants,
    row,
    createName,
    setCreateName,
    createRole,
    setCreateRole,
    save,
    active,
    draft,
    update,
    style,
    setMessage,
    onZoom,
    exportLayer,
    onCommit,
    layerIssues,
    onSelect,
    onDraw,
    staleCount,
    featureSearch,
    featureQuery,
    setFeatureQuery,
    selectedKeys,
    setSelected,
    selected,
    table,
    setScroll,
    first,
    last,
    preset,
    setPreset,
    setPending,
    previewAppearance,
    bulk,
    setBulk,
    previewBulk,
    moveTarget,
    setMoveTarget,
    move,
    selectionEditable,
    onGeometry,
    pending,
    previewPanel,
    pendingLabel,
    pendingBase,
    data,
    edits,
    message,
    layerStats,
  };
}
export type LayerWorkspaceState = ReturnType<typeof useLayerWorkspace>;
