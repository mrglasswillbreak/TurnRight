import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Feature } from 'geojson';
import type { BuildingVisual } from '../src/visual-types';
import { detailRevision } from '../src/building-facades';
import { compatibleVisual } from '../src/building-visuals';

// Fingerprints captured from the immutable published package, not recomputed
// expectations: deriving both sides with today's code hides compatibility bugs.
const { buildings } = JSON.parse(
  readFileSync(
    new URL('./fixtures/published-model-revisions.json', import.meta.url),
    'utf8',
  ),
) as { buildings: { feature: Feature; visual: BuildingVisual }[] };

for (const { feature, visual } of buildings)
  it(`retains the published model fingerprint for ${visual.name}`, () => {
    expect(detailRevision(feature)).toBe(visual.detailRevision);
    expect(compatibleVisual(feature, visual)).toBe(true);
    const changed = structuredClone(feature);
    changed.properties!.appearance.windowWidthRatio += 0.05;
    expect(compatibleVisual(changed, visual)).toBe(false);
    const resized = structuredClone(feature);
    resized.properties!.height = 30;
    expect(compatibleVisual(resized, visual)).toBe(false);
  });

it('rejects old models for added or changed roof text and restores identity on removal', () => {
  const { feature, visual } = structuredClone(buildings[0]);
  const partId = Object.keys(feature.properties!.appearance.parts)[0];
  const roofTexts = {
    [partId]: [
      {
        id: 'sign',
        text: 'SENATE',
        coordinates: [3.19978, 6.47109],
        width: 5,
        height: 1,
        rotation: 0,
        colour: '#172b36',
      },
    ],
  };
  feature.properties!.appearance.roofTexts = roofTexts;
  expect(compatibleVisual(feature, visual)).toBe(false);
  const textVisual = { ...visual, detailRevision: detailRevision(feature) };
  expect(compatibleVisual(feature, textVisual)).toBe(true);
  roofTexts[partId][0].text = 'NEW NAME';
  expect(compatibleVisual(feature, textVisual)).toBe(false);
  delete feature.properties!.appearance.roofTexts;
  expect(compatibleVisual(feature, visual)).toBe(true);
});
