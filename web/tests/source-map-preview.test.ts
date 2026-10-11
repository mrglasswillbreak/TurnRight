import { expect, it } from 'vitest';
import { proposalBounds, proposalFeatures } from '../src/source-map-preview';
import type { SourceMapRow } from '../src/source-updates';

const point = (x: number) => ({
  geometry: { type: 'Point' as const, coordinates: [x, 6] },
  simplified: false,
});
it('shows every proposal without changing selection or inventing geometry', () => {
  const rows: SourceMapRow[] = [
    {
      id: 'new',
      revision: 1,
      name: 'New',
      kind: 'add',
      before: null,
      after: point(3),
    },
    {
      id: 'move',
      revision: 1,
      name: 'Moved',
      kind: 'modify',
      before: point(2),
      after: point(4),
    },
    {
      id: 'gone',
      revision: 1,
      name: 'Removed',
      kind: 'remove',
      before: point(5),
      after: null,
    },
    {
      id: 'meta',
      revision: 1,
      name: 'Metadata',
      kind: 'modify',
      before: null,
      after: null,
    },
  ];
  const original = JSON.stringify(rows);
  const proposed = proposalFeatures(rows, false);
  expect(proposed.map((f) => f.properties?.proposalId)).toEqual([
    'new',
    'move',
    'gone',
  ]);
  expect(proposed.at(-1)?.properties).toMatchObject({
    side: 'before',
    kind: 'remove',
    color: '#c53c4b',
  });
  expect(proposalFeatures(rows, true)).toHaveLength(4);
  expect(proposalBounds(proposed)).toEqual([
    [3, 6],
    [5, 6],
  ]);
  expect(proposalBounds(proposalFeatures(rows, true))).toEqual([
    [2, 6],
    [5, 6],
  ]);
  expect(JSON.stringify(rows)).toBe(original);
  expect(proposalBounds([])).toBeNull();
});
