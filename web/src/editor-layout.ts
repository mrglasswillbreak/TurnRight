import type { WorkspaceCapabilities } from './gis-types';

export const editorWorkspaces = [
  ['gis-data', 'Data'],
  ['map', 'Edit'],
  ['gis-analyze', 'Analyze'],
  ['gis-review', 'Review'],
  ['gis-publish', 'Publish'],
] as const;
export type WorkspaceId = (typeof editorWorkspaces)[number][0];
export type PaneId = 'left' | 'right' | 'bottom';
export type EditorSection =
  | WorkspaceId
  | 'layers'
  | 'campuses'
  | 'changes'
  | 'duplicates'
  | 'reports'
  | 'releases'
  | 'settings'
  | 'members';
export function workspaceForSection(section: string): WorkspaceId {
  if (['changes', 'duplicates', 'reports'].includes(section))
    return 'gis-review';
  if (section === 'releases') return 'gis-publish';
  if (section === 'campuses') return 'gis-data';
  return editorWorkspaces.some(([id]) => id === section)
    ? (section as WorkspaceId)
    : 'map';
}
export function defaultWorkspace(access?: WorkspaceCapabilities): WorkspaceId {
  if (!access || access.capabilities.includes('edit')) return 'map';
  if (access.capabilities.includes('review')) return 'gis-review';
  if (access.capabilities.includes('publish')) return 'gis-publish';
  return 'gis-data';
}
export interface LayoutPreference {
  version: 1;
  workspace: WorkspaceId;
  workspaces?: Partial<Record<'desktop' | 'compact', WorkspaceId>>;
  legend: boolean;
  sizes: Record<string, Record<string, number>>;
  collapsed: Partial<Record<string, boolean>>;
}
export const layoutKey = (owner: string, campus: string) =>
  `turnright:layout:v1:${encodeURIComponent(owner)}:${encodeURIComponent(campus)}`;
export const viewportClass = () =>
  typeof matchMedia === 'function' && matchMedia('(max-width: 1199px)').matches
    ? 'compact'
    : 'desktop';
export function readLayout(
  key: string,
  access?: WorkspaceCapabilities,
): LayoutPreference {
  const fallback: LayoutPreference = {
    version: 1,
    workspace: defaultWorkspace(access),
    legend: true,
    sizes: {},
    collapsed: {},
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.version !== 1) return fallback;
    if (
      editorWorkspaces.some(([id]) => id === saved.workspace) &&
      (saved.workspace !== 'map' ||
        !access ||
        access.capabilities.includes('edit'))
    )
      fallback.workspace = saved.workspace;
    if (saved.workspaces && typeof saved.workspaces === 'object') {
      fallback.workspaces = {};
      for (const viewport of ['desktop', 'compact'] as const) {
        const id = saved.workspaces[viewport];
        if (
          editorWorkspaces.some(([key]) => key === id) &&
          (id !== 'map' || !access || access.capabilities.includes('edit'))
        )
          fallback.workspaces[viewport] = id;
      }
      fallback.workspace =
        fallback.workspaces[viewportClass()] || defaultWorkspace(access);
    }
    if (typeof saved.legend === 'boolean') fallback.legend = saved.legend;
    if (saved.sizes && typeof saved.sizes === 'object') {
      for (const [scope, values] of Object.entries(saved.sizes)) {
        if (!values || typeof values !== 'object') continue;
        const entries = Object.entries(values).filter(
          ([, v]) =>
            typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100,
        );
        if (entries.length) fallback.sizes[scope] = Object.fromEntries(entries);
      }
    }
    if (saved.collapsed && typeof saved.collapsed === 'object') {
      for (const [pane, value] of Object.entries(saved.collapsed)) {
        if (
          typeof value === 'boolean' &&
          /^(?:(?:gis-data|map|gis-analyze|gis-review|gis-publish|photo|model):(?:desktop|compact):)?(?:left|right|bottom)$/.test(
            pane,
          )
        )
          fallback.collapsed[pane] = value;
      }
    }
  } catch {
    /* A layout is optional; editing and recovery do not depend on it. */
  }
  return fallback;
}
export function writeLayout(key: string, value: LayoutPreference) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Session-only preferences. */
  }
}
