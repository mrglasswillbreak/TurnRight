import type { SourceFixtureObservation } from './source-fixture-types';
import { identityOf } from '../../scripts/source-comparison.mjs';
import { hash } from '../../scripts/cloud.mjs';
import { registerObservationContracts } from './source-reliability-observation-contracts';
import { registerSemanticComparison } from './source-reliability-semantic-comparison';
import { registerProvenance } from './source-reliability-provenance';
const feature = (id: string, name = 'Path') => ({
  id: 'feature:' + id,
  source: 'osm',
  entity: 'feature',
  payload: {
    type: 'Feature',
    properties: { id, kind: 'path', name },
    geometry: {
      type: 'LineString',
      coordinates: [
        [3, 6],
        [3.1, 6],
      ],
    },
  },
  hash: hash({ id, name }),
});
const observation = (
  id: string,
  name = 'Path',
): SourceFixtureObservation & { identity: string; contentHash: string } => {
  const content = {
    name,
    geometry: [
      [3, 6],
      [3.1, 6],
    ],
  };
  return {
    provider: 'osm',
    collection: 'ways',
    nativeId: 'way:' + id,
    featureType: 'path',
    stable: true,
    content,
    contentHash: hash(content),
    configurationHash: 'configuration',
    records: [feature(id, name)],
    identity: identityOf({
      provider: 'osm',
      collection: 'ways',
      nativeId: 'way:' + id,
    }),
  };
};
const receipt = {
  configurationHash: 'configuration',
  collections: [{ identity: 'ways', complete: true, count: 1 }],
};
const audit = new URL(
  '../../data/candidates/source-audit-2026-10-13/',
  import.meta.url,
);
const fixture = () => ({ feature, observation, receipt, audit });
export type SourceReliabilityFixture = ReturnType<typeof fixture>;
registerObservationContracts(fixture);
registerSemanticComparison(fixture);
registerProvenance(fixture);
