import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultWorkspace,
  layoutKey,
  readLayout,
  workspaceForSection,
  writeLayout,
} from '../src/editor-layout';
import type { WorkspaceCapabilities } from '../src/gis-types';
const access = (
  ...capabilities: WorkspaceCapabilities['capabilities']
): WorkspaceCapabilities => ({
  campusId: 'lasu',
  userId: 'a',
  roles: [],
  capabilities,
});
afterEach(() => vi.unstubAllGlobals());
describe('editor presentation preferences', () => {
  it('separates account and campus identities without ambiguous keys', () => {
    expect(layoutKey('a:b', 'c')).not.toBe(layoutKey('a', 'b:c'));
    expect(layoutKey('a', 'lasu')).not.toBe(layoutKey('a', 'unilag'));
  });
  it('uses capability-aware first visits and groups secondary sections', () => {
    expect(defaultWorkspace(access('edit'))).toBe('map');
    expect(defaultWorkspace(access('review'))).toBe('gis-review');
    expect(defaultWorkspace(access('publish'))).toBe('gis-publish');
    expect(defaultWorkspace(access())).toBe('gis-data');
    expect(workspaceForSection('duplicates')).toBe('gis-review');
    expect(workspaceForSection('releases')).toBe('gis-publish');
    expect(workspaceForSection('campuses')).toBe('gis-data');
  });
  it('ignores malformed storage and rejects obsolete or inaccessible destinations', () => {
    let data = '{broken';
    vi.stubGlobal('localStorage', { getItem: () => data, setItem: vi.fn() });
    expect(readLayout('x', access('review')).workspace).toBe('gis-review');
    data = JSON.stringify({
      version: 1,
      workspace: 'map',
      legend: false,
      sizes: { desktop: { left: -5, right: 1000, bottom: 45 } },
      collapsed: { left: true },
    });
    expect(readLayout('x', access('review'))).toMatchObject({
      workspace: 'gis-review',
      legend: false,
      sizes: { desktop: { bottom: 45 } },
      collapsed: { left: true },
    });
    data = JSON.stringify({
      version: 99,
      workspace: 'gis-publish',
      legend: false,
    });
    expect(readLayout('x').legend).toBe(true);
  });
  it('restores different workspace choices by viewport while keeping legend campus-scoped', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key),
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const key = layoutKey('owner', 'lasu');
    writeLayout(key, {
      version: 1,
      workspace: 'map',
      workspaces: { desktop: 'gis-analyze', compact: 'gis-review' },
      legend: false,
      sizes: {},
      collapsed: {},
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(readLayout(key).workspace).toBe('gis-analyze');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(readLayout(key).workspace).toBe('gis-review');
    expect(readLayout(key).legend).toBe(false);
    expect(readLayout(layoutKey('owner', 'unilag')).legend).toBe(true);
    expect(readLayout(layoutKey('other', 'lasu')).legend).toBe(true);
  });
  it('works with storage blocked without affecting document recovery', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      },
    });
    const value = readLayout('x');
    expect(value.workspace).toBe('map');
    expect(() => writeLayout('x', value)).not.toThrow();
  });
});
