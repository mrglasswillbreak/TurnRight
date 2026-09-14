import evidenceData from '../../data/building-evidence.json';
import type { Feature } from 'geojson';
import type { CampusData, MapEdit } from './types';
import type { SurfaceStyle, VisualCatalogue } from './visual-types';
import type { DuplicateCandidate } from './duplicates';
import { buildingDisplay } from './map-display';
import { buildingRevision } from './building-visuals';
import {
  resolveBuildingVisual,
  styleFor,
  polygonsOf,
  buildingTopology,
} from './building-surfaces';
import { repairArcGisParts } from './arcgis-rings';
import { validateBuildingStyle } from './building-style-validation';
import { featureEdit } from './editor-features';

interface EvidenceRecord {
  floors?: number;
  appearance?: SurfaceStyle;
  footprintRevisions?: string[];
  sources: string[];
  observed: string[];
  inferred: string[];
  needed: string[];
}
export const buildingEvidence = evidenceData as {
  assessedAt: string;
  references: VisualCatalogue['references'];
  buildings: Record<string, EvidenceRecord>;
};
export function footprintRevision(feature: Feature) {
  return buildingRevision({ ...feature, properties: {} });
}
export interface BuildingReferenceProposal {
  id: string;
  name: string;
  basis: 'photograph' | 'source-height';
  edit?: MapEdit;
  before: SurfaceStyle;
  after: SurfaceStyle;
  fields: string[];
  sources: VisualCatalogue['references'];
  notes: string[];
  reason?: string;
}

/** Proposals are property-only and are recomputed against the current draft.
 * Explicit owner overrides, roofs, topology, geometry and routing are retained. */
export function buildingReferenceProposals(
  data: CampusData,
  duplicates: DuplicateCandidate[],
  edits: MapEdit[] = [],
): BuildingReferenceProposal[] {
  const buildings = data.map.features.filter(
    (f) => f.properties?.kind === 'building' && polygonsOf(f.geometry).length,
  );
  const features = new Map(buildings.map((f) => [String(f.properties!.id), f]));
  const visuals = new Map(data.visuals?.buildings.map((v) => [v.id, v]));
  const hasHeight = (f: Feature) =>
    buildingDisplay(f.properties || {}).kind !== 'illustrative' ||
    (f.properties?.heightMode === undefined &&
      visuals.get(String(f.properties?.id))?.heightKind === 'observed-floors');
  return buildings.map((feature) => {
    const id = String(feature.properties!.id);
    const current = featureEdit(data, 'building', id, edits)!;
    const p = current.properties;
    const record = buildingEvidence.buildings[id];
    const matched = !!record?.footprintRevisions?.includes(
      footprintRevision(feature),
    );
    const visual = resolveBuildingVisual(feature, visuals.get(id));
    const before = styleFor(p.appearance, visual);
    const proposal: BuildingReferenceProposal = {
      id,
      name: String(p.name || 'Unnamed building'),
      basis: matched ? 'photograph' : 'source-height',
      before,
      after: before,
      fields: [],
      sources: buildingEvidence.references.filter((r) =>
        (matched ? record.sources : [String(p.source)]).includes(r.id),
      ),
      notes: matched
        ? [...record.observed, ...record.inferred, ...record.needed]
        : hasHeight(feature)
          ? [
              'Height comes from the source record. Colours, regular 4 m window spacing and trim are illustrative, not a photographed reconstruction.',
              'The current roof shape and all mapped geometry are retained. Dated facade and roof references are still needed.',
            ]
          : [
              'A secure height and footprint-matched facade photograph are still needed. No architectural detail is inferred from the building name alone.',
            ],
    };
    const block = (reason: string) => ({ ...proposal, reason });
    if (repairArcGisParts(feature))
      return block('Review the separate-wing outline correction first.');
    if (record && !matched)
      return block(
        'The footprint has changed since reference matching. Recheck the building association.',
      );
    if (
      duplicates.some(
        (d) =>
          d.kind === 'building' &&
          d.ids.includes(id) &&
          d.ids.some((other) => {
            const f = features.get(other);
            return (
              other !== id &&
              f &&
              (hasHeight(f) || !!buildingEvidence.buildings[other])
            );
          }),
      )
    )
      return block('Review the overlapping building identities first.');
    if (
      /(construction|ongoing|car park|sports cent|botanical|zoological|site for)/i.test(
        proposal.name,
      )
    )
      return block(
        'Confirm the built footprint and current construction state before adding facade detail.',
      );
    const canUseObservedFloors =
      matched &&
      record.floors &&
      p.heightMode === undefined &&
      p.appearance?.heightMode === undefined;
    if (!hasHeight(feature) && !canUseObservedFloors)
      return block(
        'Height is unknown. Retain the muted illustrative block until floors or height are documented.',
      );
    if (
      !hasHeight(feature) &&
      canUseObservedFloors &&
      polygonsOf(feature.geometry).length > 1
    )
      return block(
        'Assign the photographed floor count to its specific wing before applying this reference.',
      );
    if (
      validateBuildingStyle({
        id,
        kind: 'building',
        geometry: feature.geometry,
        properties: p,
      }).length
    )
      return block(
        'Resolve the existing appearance or surface-assignment issues first.',
      );
    const treatment: SurfaceStyle = matched
      ? record.appearance || {}
      : {
          windows: true,
          windowSpacing: 4,
          wallColour: before.wallColour,
          roofColour: before.roofColour,
          windowColour: before.windowColour,
          trimColour: before.trimColour,
          confidence: 'inferred',
          provenance: `Illustrative facade treatment, 2026-09-14. ${buildingDisplay(p).description} Regular window spacing and trim are schematic; dated photographs and measured opening dimensions are still needed.`,
        };
    const appearance = { ...treatment, ...p.appearance };
    // A photographed main block does not establish its auxiliary wings. Keep
    // their resolved treatment when installing new building-wide defaults.
    for (const [i, part] of buildingTopology(feature).parts.entries()) {
      if (visual.partHeights?.[i]?.kind !== 'illustrative') continue;
      const inherited = styleFor(p.appearance, visual, part.id);
      const retained = Object.fromEntries(
        (Object.keys(treatment) as (keyof SurfaceStyle)[])
          .filter(
            (key) =>
              !['provenance', 'confidence'].includes(key) &&
              inherited[key] !== undefined,
          )
          .map((key) => [key, inherited[key]]),
      );
      appearance.parts = {
        ...appearance.parts,
        [part.id]: { ...retained, ...appearance.parts?.[part.id] },
      };
      proposal.notes.push(
        'The unmeasured auxiliary wing retains its existing colours and window visibility. The photographed main block does not establish that wing’s appearance.',
      );
    }
    const properties: MapEdit['properties'] = { ...p, appearance };
    // A newly matched floor observation is stored in the existing building
    // properties, where both editor and immutable release resolve the height.
    if (!hasHeight(feature) && canUseObservedFloors) {
      properties.floors = record.floors;
      properties.heightMode = 'floors';
    }
    const edit: MapEdit = { ...current, properties };
    const after = styleFor(
      appearance,
      resolveBuildingVisual({ ...feature, properties }, visuals.get(id)),
    );
    const fields = (Object.keys(treatment) as (keyof SurfaceStyle)[]).filter(
      (k) => p.appearance?.[k] === undefined,
    );
    if (properties.heightMode !== p.heightMode) {
      fields.push('floors');
      before.floors = visual.floors;
      after.floors = Number(properties.floors);
    }
    if (!fields.length)
      return block('Appearance already applied or explicitly customized.');
    if (validateBuildingStyle(edit).length)
      return block(
        'Review the proposed appearance against the current roof and height.',
      );
    return { ...proposal, edit, after, fields };
  });
}
