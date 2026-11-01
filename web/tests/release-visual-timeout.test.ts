import { expect, it } from 'vitest';
import { visualBuildTimeout } from '../../scripts/release-visual-timeout.mjs';

const base = () => ({ properties: { kind: 'building', floors: 2 } });
const detailed = (tier: string) => ({
  properties: {
    kind: 'building',
    modelDocument: { version: 1, objects: [{ detailTier: tier }] },
  },
});

it('gives the measured 614-building, 20-detailed-model release bounded compilation headroom', () => {
  const features = [
    ...Array.from({ length: 594 }, base),
    ...Array.from({ length: 20 }, (_, i) =>
      detailed(['structure', 'facade', 'fine'][i % 3]),
    ),
  ];
  expect(visualBuildTimeout(features)).toBe(300000);
  // More detailed models cannot silently turn the worker into an unbounded job.
  expect(visualBuildTimeout([...features, ...features])).toBe(300000);
});

it('preserves the existing base-campus and legacy unclassified-model timeout', () => {
  expect(visualBuildTimeout(Array.from({ length: 614 }, base))).toBe(120000);
  expect(
    visualBuildTimeout([
      {
        properties: {
          kind: 'building',
          modelDocument: { version: 1, objects: [{}] },
        },
      },
      {
        ...detailed('facade'),
        properties: { ...detailed('facade').properties, kind: 'land' },
      },
    ]),
  ).toBe(120000);
});

it.each([
  undefined,
  null,
  {},
  [],
  [null, {}, { properties: { kind: 'building', modelDocument: null } }],
  [
    {
      properties: {
        kind: 'building',
        modelDocument: { version: 1, objects: 'facade' },
      },
    },
  ],
  [
    {
      properties: {
        kind: 'building',
        modelDocument: { version: 1, objects: [null, {}] },
      },
    },
  ],
  [detailed('unrecognized')],
])(
  'uses the bounded base fallback for empty or invalid metadata: %j',
  (features) => {
    expect(visualBuildTimeout(features)).toBe(120000);
  },
);
