import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { campusFixture } from './fixture';
import { proposeHipRoof } from '../src/roof-proposal';
import {
  buildingTopology,
  resolveBuildingVisual,
} from '../src/building-surfaces';
import { createBuildingModel } from '../src/building-model';
import { buildingRevision } from '../src/building-visuals';
import type { Feature, Polygon } from 'geojson';
import type { SectorModels, VisualCatalogue } from '../src/visual-types';

describe('roof release generation', () => {
  it('packages the same custom roof and facade as the editor without flattening or downgrading it', () => {
    const feature: Feature<Polygon> = {
      type: 'Feature',
      properties: {
        id: 'roof-test',
        kind: 'building',
        name: 'Roof test',
        height: 9,
        source: 'campus-review',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2, 6.46],
            [3.2003, 6.46],
            [3.2003, 6.4601],
            [3.2001, 6.4601],
            [3.2001, 6.4603],
            [3.2, 6.4603],
            [3.2, 6.46],
          ],
        ],
      },
    };
    const topology = buildingTopology(feature),
      roof = proposeHipRoof(feature.geometry.coordinates, 9);
    feature.properties!.buildingTopology = topology;
    feature.properties!.appearance = {
      roofForm: 'hip',
      windows: true,
      roofColour: '#bb6655',
      roofs: { [topology.parts[0].id]: roof },
    };
    const data = {
      ...campusFixture(),
      map: { type: 'FeatureCollection', features: [feature] },
    };
    const dir = mkdtempSync(path.join(tmpdir(), 'turnright-roof-release-'));
    try {
      const source = path.join(dir, 'campus.json'),
        output = path.join(dir, 'visuals');
      const frozen = JSON.stringify(data);
      writeFileSync(source, frozen);
      execFileSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'scripts/build-campus-visuals.ts',
          source,
          output,
          '--reviewed',
        ],
        { timeout: 20000, stdio: 'pipe' },
      );
      expect(readFileSync(source, 'utf8')).toBe(frozen);
      const catalogue = JSON.parse(
        readFileSync(path.join(output, 'catalogue.json'), 'utf8'),
      ) as VisualCatalogue;
      const visual = catalogue.buildings[0];
      expect(visual.level).toBe('detailed');
      expect(visual.inferred.join(' ')).toContain(roof.provenance);
      expect(visual.inferred.join(' ')).not.toContain('remains a flat cap');
      const sector = JSON.parse(
        readFileSync(
          path.join(output, catalogue.sectors[0].url.split('/').at(-1)!),
          'utf8',
        ),
      ) as SectorModels;
      const preview = resolveBuildingVisual(feature);
      preview.geometryRevision = buildingRevision(feature);
      expect(sector.models[0]).toEqual(createBuildingModel(feature, preview));
    } finally {
      if (
        path.dirname(path.resolve(dir)) !== path.resolve(tmpdir()) ||
        !path.basename(dir).startsWith('turnright-roof-release-')
      )
        console.error('Unexpected test output directory; cleanup skipped.');
      else rmSync(dir, { recursive: true, force: true });
    }
  }, 25000);
});
