import type { CampusData, MapEdit } from './types';
import type { CustomRoof, VisualCatalogue } from './visual-types';
import type { DuplicateCandidate } from './duplicates';
import { buildingEvidence, footprintRevision } from './building-references';
import {
  buildingTopology,
  polygonsOf,
  resolveBuildingVisual,
  styleFor,
} from './building-surfaces';
import { featureEdit } from './editor-features';
import { buildingDisplay } from './map-display';
import { repairArcGisParts } from './arcgis-rings';
import { proposeHipRoof } from './roof-proposal';
import { validateBuildingStyle } from './building-style-validation';

export interface BuildingRoofProposal {
  id: string;
  name: string;
  basis: 'photo-form' | 'approximate';
  edit?: MapEdit;
  reason?: string;
  roofs: { partId: string; polygon: number[][][]; roof: CustomRoof }[];
  sources: VisualCatalogue['references'];
}

/** Propose custom roofs separately from facade references; never overwrite owner roofs. */
export function buildingRoofProposals(
  data: CampusData,
  duplicates: DuplicateCandidate[],
  edits: MapEdit[] = [],
): BuildingRoofProposal[] {
  const visuals = new Map(data.visuals?.buildings.map((v) => [v.id, v]));
  const features = new Map(
    data.map.features.map((f) => [String(f.properties?.id), f]),
  );
  return data.map.features
    .filter(
      (f) => f.properties?.kind === 'building' && polygonsOf(f.geometry).length,
    )
    .map((original) => {
      const id = String(original.properties!.id),
        current = featureEdit(data, 'building', id, edits)!;
      const feature = {
        ...original,
        geometry: current.geometry,
        properties: current.properties,
      };
      const record = buildingEvidence.buildings[id];
      const matched = record?.footprintRevisions?.includes(
        footprintRevision(feature),
      );
      const visual = resolveBuildingVisual(feature, visuals.get(id));
      const photoForm = matched && record.roofForm === 'hip';
      const proposal: BuildingRoofProposal = {
        id,
        name: String(current.properties.name || 'Unnamed building'),
        basis: photoForm ? 'photo-form' : 'approximate',
        roofs: [],
        sources: buildingEvidence.references.filter(
          (r) => matched && record.sources.includes(r.id),
        ),
      };
      const block = (reason: string) => ({ ...proposal, reason });
      if (record && !matched)
        return block(
          'The reference footprint changed. Review its roof association first.',
        );
      if (matched && record.roofForm === 'flat')
        return block(
          'Retained: the reference shows a flat/parapet silhouette or does not establish the concealed roof.',
        );
      if (repairArcGisParts(feature))
        return block(
          'Review separate-wing outline correction before creating roof plans.',
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
                (buildingDisplay(f.properties || {}).kind !== 'illustrative' ||
                  !!buildingEvidence.buildings[other])
              );
            }),
        )
      )
        return block('Review competing building models before adding a roof.');
      if (
        /(construction|ongoing|car park|sports cent|botanical|zoological|site for|mosque)/i.test(
          proposal.name,
        )
      )
        return block(
          'Current built form or a specialized roof needs its own reference.',
        );
      if (
        visual.heightKind === 'illustrative' ||
        current.properties.heightMode === 'unknown'
      )
        return block('Height is unknown; roof retained pending evidence.');
      if (visuals.get(id)?.level === 'extrusion')
        return block(
          'Resolve this building’s visual/outline review before adding roof detail.',
        );
      const errors = validateBuildingStyle(current);
      if (errors.length) return block(errors.join(' '));
      const appearance = structuredClone(current.properties.appearance || {});
      const topology = buildingTopology(feature);
      try {
        for (const [i, part] of topology.parts.entries()) {
          const own = appearance.parts?.[part.id];
          if (
            appearance.roofs?.[part.id] ||
            own?.roofForm !== undefined ||
            appearance.roofForm !== undefined ||
            own?.heightMode === 'unknown'
          )
            continue;
          if (
            visual.partHeights?.[i]?.kind === 'illustrative' &&
            !own?.height &&
            own?.heightMode !== 'floors'
          )
            continue;
          const height =
            own?.heightMode === 'floors'
              ? Number(own.floors) * 3
              : (own?.height ??
                visual.partHeights?.[i]?.height ??
                visual.height);
          const polygon = polygonsOf(current.geometry)[i],
            roof = proposeHipRoof(polygon, height);
          roof.provenance = `${photoForm ? 'Pitched roof form is visible in the matched photograph; the individual ridge layout is approximate. ' : 'Roof form is unknown: this is an illustrative hip-roof option, not a photographed reconstruction. '}${roof.provenance}${proposal.sources.length ? ' References: ' + proposal.sources.map((r) => r.url).join(' ') : ''}`;
          (appearance.roofs ||= {})[part.id] = roof;
          // A newly separated auxiliary wing may have inherited a whole-building
          // visual. Retain that visible palette when release assigns wing defaults.
          if (
            i > 0 &&
            matched &&
            record.floors &&
            buildingDisplay(current.properties).kind === 'illustrative' &&
            !visual.partHeights?.[i] &&
            !own?.heightMode &&
            !own?.height
          ) {
            const resolved = styleFor(appearance, visual, part.id);
            (appearance.parts ||= {})[part.id] = {
              wallColour: resolved.wallColour,
              roofColour: resolved.roofColour,
              windowColour: resolved.windowColour,
              trimColour: resolved.trimColour,
              windows: resolved.windows,
              windowSpacing: resolved.windowSpacing,
              ...own,
              heightMode: 'unknown',
            };
            roof.provenance +=
              ' Auxiliary wing: actual height and roof form are unknown; the existing 6 m height is illustrative.';
          }
          // Validation and release use stored height, including formerly catalogue-only observations.
          if (
            !own?.heightMode &&
            !own?.height &&
            height !== buildingDisplay(current.properties).metres
          )
            (appearance.parts ||= {})[part.id] = {
              ...own,
              height,
              heightMode: 'metres',
              confidence: 'inferred',
              provenance:
                'Total height retained from the existing visual reference when applying this roof.',
            };
          proposal.roofs.push({ partId: part.id, polygon, roof });
        }
        if (!proposal.roofs.length)
          return block(
            'Existing custom roof, explicit roof choice or unknown wing height retained.',
          );
        const edit: MapEdit = {
          ...current,
          properties: {
            ...current.properties,
            buildingTopology: topology,
            appearance,
          },
        };
        const issues = validateBuildingStyle(edit);
        if (issues.length) return block(issues.join(' '));
        return { ...proposal, edit };
      } catch (error) {
        return block((error as Error).message);
      }
    });
}
