import { describe, expect, it } from 'vitest';
import {
  unpublishedEdits,
  publishedBuildingRestore,
} from '../src/editor-publication';
import type { MapEdit } from '../src/types';

const edit = (id: string): MapEdit => ({
  id,
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.2, 6.46] },
  properties: { name: id },
});

describe('unpublished editor corrections', () => {
  it('restores one building from the matching release without reverting save identity or other edits', () => {
    const before: MapEdit = {
      ...edit('hall'),
      kind: 'building',
      properties: { height: 12, heightMode: 'metres', name: 'Hall' },
      updated_at: 'old',
    };
    const current: MapEdit = {
      ...before,
      properties: { ...before.properties, height: 6 },
      updated_at: 'current',
    };
    const published = { version: 'live', edits: [before, edit('other')] };
    const next = publishedBuildingRestore(current, published, 'live')!;
    expect(next.properties).toEqual(before.properties);
    expect(next.updated_at).toBe('current');
    expect(
      publishedBuildingRestore(current, published, 'older'),
    ).toBeUndefined();
    expect(publishedBuildingRestore(before, published, 'live')).toBeUndefined();
    expect(
      publishedBuildingRestore(edit('other'), published, 'live'),
    ).toBeUndefined();
    next.properties.height = 9;
    expect(before.properties.height).toBe(12);
    expect(current.properties.height).toBe(6);
  });
  it('hides published corrections without removing saved data and ignores save metadata', () => {
    const saved = edit('library');
    const current = {
      ...saved,
      deleted: false,
      updated_at: 'later',
      edited_by: 'owner',
    };
    expect(
      unpublishedEdits([current], { version: 'live', edits: [saved] }),
    ).toEqual([]);
    expect(current.properties.name).toBe('library');
  });
  it('shows new, changed, deleted, and reverted corrections', () => {
    const previous = ['changed', 'deleted', 'reverted'].map(edit);
    const current = [
      edit('new'),
      { ...edit('changed'), properties: { name: 'New name' } },
      { ...edit('deleted'), deleted: true },
      {
        ...edit('reverted'),
        deleted: true,
        properties: { revertToSource: true },
      },
    ];
    expect(
      unpublishedEdits(current, { version: 'live', edits: previous }),
    ).toEqual(current);
  });
  it('uses the restored release snapshot and preserves edits made during publication', () => {
    const before = edit('library');
    const after = { ...before, properties: { name: 'Updated library' } };
    expect(
      unpublishedEdits([after], { version: 'restored', edits: [before] }),
    ).toEqual([after]);
    expect(
      unpublishedEdits([after], { version: 'new', edits: [after] }),
    ).toEqual([]);
  });
  it('keeps drafts visible before a first release but omits unused revert tombstones', () => {
    const added = edit('new');
    expect(
      unpublishedEdits(
        [
          added,
          {
            ...edit('unused'),
            deleted: true,
            properties: { revertToSource: true },
          },
        ],
        null,
      ),
    ).toEqual([added]);
  });
});
