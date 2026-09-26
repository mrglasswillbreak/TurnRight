import { describe, expect, it } from 'vitest';
import {
  commitDetailInstances,
  detailInstanceId,
  detailInstanceSelection,
  expandDetailInstances,
  detailInstanceFlags,
  toggleDetailInstanceFlags,
} from '../src/model-instances';
import {
  emptyAuthoring,
  placementErrors,
  regeneratePattern,
} from '../src/model-authoring';
import type { FacadeElement } from '../src/visual-types';

const row: FacadeElement = {
  id: 'windows',
  kind: 'window',
  x: 0.5,
  bottom: 1,
  width: 1,
  height: 2,
  depth: 0.1,
  count: 7,
  spacing: 0.1,
  colour: '#123456',
};
const commit = (next: FacadeElement[]) =>
  commitDetailInstances([row], next, emptyAuthoring(), 'wall');
const sameWindows = (actual: FacadeElement[], expected: FacadeElement[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((e, i) => {
    expect(e.x).toBeCloseTo(expected[i].x, 12);
    expect({ ...e, x: 0 }).toEqual({ ...expected[i], x: 0 });
  });
};
describe('individual windows with compact storage', () => {
  it('locks and hides individual windows without changing neighbours or losing row protection', () => {
    const ids = expandDetailInstances([row]).map((e) => e.id);
    const flags = toggleDetailInstanceFlags([row], [], [ids[2]]);
    expect(flags).toEqual([ids[2]]);
    expect(detailInstanceFlags([row], flags, true)).toContain(row.id);
    expect(detailInstanceFlags([row], flags)).not.toContain(row.id);
    expect(toggleDetailInstanceFlags([row], flags, [ids[2]])).toEqual([]);
    const all = toggleDetailInstanceFlags([row], [], [row.id]);
    expect(all).toEqual(ids);
    const unlocked = toggleDetailInstanceFlags([row], all, [ids[2]]);
    expect(unlocked).toEqual(ids.filter((id) => id !== ids[2]));
  });
  it('selects without changing saved geometry and retains an untouched row', () => {
    const view = expandDetailInstances([row]);
    expect(view).toHaveLength(7);
    expect(detailInstanceSelection([row], view[3].id)).toEqual({
      elementId: row.id,
      instanceIndex: 3,
    });
    expect(commit(view).elements).toEqual([row]);
  });
  for (const index of [0, 3, 6])
    it(`edits window ${index + 1} without changing neighbours or identities`, () => {
      const view = expandDetailInstances([row]);
      const next = view.map((e, i) =>
        i === index ? { ...e, width: 1.25, x: e.x + 0.01 } : e,
      );
      const stored = commit(next).elements;
      expect(stored.length).toBeLessThanOrEqual(3);
      sameWindows(expandDetailInstances(stored), next);
      const second = expandDetailInstances(stored).map((e) =>
        e.id === view[1].id ? { ...e, bottom: 1.5 } : e,
      );
      sameWindows(
        expandDetailInstances(
          commitDetailInstances(stored, second, emptyAuthoring(), 'wall')
            .elements,
        ),
        second,
      );
      expect(expandDetailInstances([row]).map((e) => e.id)).toEqual(
        view.map((e) => e.id),
      );
    });
  it('deletes two selected instances and duplicates one without expanding other records', () => {
    const view = expandDetailInstances([row]);
    const next = view.filter((_, i) => i !== 1 && i !== 5);
    next.push({ ...view[3], id: 'copy', bottom: 4 });
    expect(expandDetailInstances(commit(next).elements)).toEqual(next);
  });
  it('keeps explicitly selected rows available for batch edits', () => {
    expect(expandDetailInstances([row], [row.id])).toEqual([row]);
    const next = { ...row, width: 1.4 };
    expect(
      commitDetailInstances(
        [row],
        [next],
        emptyAuthoring(),
        'wall',
        [row.id],
        true,
      ).elements,
    ).toEqual([next]);
  });
  it('detaches an edited pattern member without propagating or regenerating it', () => {
    const a = { ...row, id: 'a', count: 1, spacing: 0 };
    const b = { ...a, id: 'b', x: 0.7 };
    const metadata = emptyAuthoring();
    metadata.patterns.push({
      id: 'p',
      name: 'Windows',
      wallId: 'wall',
      seed: [a],
      members: ['a', 'b'],
      slots: ['0:0:0', '0:1:0'],
      rows: 1,
      columns: 2,
      stepX: 4,
      stepY: 0,
    });
    const result = commitDetailInstances(
      [a, b],
      [{ ...a, colour: '#ffffff' }, b],
      metadata,
      'wall',
    );
    expect(result.elements[1]).toEqual(b);
    expect(result.authoring.patterns[0].members).toEqual(['b']);
    expect(result.authoring.patterns[0].excluded).toEqual(['0:0:0']);
    expect(
      regeneratePattern(result.authoring.patterns[0], 20).elements,
    ).toHaveLength(1);
  });
  it('preserves group references and names when a row splits', () => {
    const metadata = emptyAuthoring();
    metadata.names[row.id] = 'East windows';
    metadata.groups.push({
      id: 'g',
      name: 'Facade',
      wallId: 'wall',
      members: [row.id],
    });
    const next = expandDetailInstances([row]).map((e, i) =>
      i === 3 ? { ...e, width: 1.2 } : e,
    );
    const result = commitDetailInstances([row], next, metadata, 'wall');
    expect(result.authoring.groups[0].members).toEqual(
      result.elements.map((e) => e.id),
    );
    expect(result.authoring.names[detailInstanceId(row.id, 3)]).toBe(
      'East windows',
    );
  });
  it('validates compact records rather than counting virtual handles against the record limit', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...row,
      id: `row${i}`,
      count: 20,
      spacing: 0.03,
    }));
    const expanded = expandDetailInstances(records);
    expect(expanded).toHaveLength(200);
    const stored = commitDetailInstances(
      records,
      expanded,
      emptyAuthoring(),
      'wall',
    ).elements;
    expect(placementErrors(stored, 100, 10)).toEqual([]);
    expect(
      placementErrors(
        Array.from({ length: 101 }, (_, i) => ({ ...row, id: String(i) })),
        100,
        10,
      )[0].message,
    ).toContain('100');
  });
});
