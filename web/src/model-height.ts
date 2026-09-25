import type { MapEdit } from './types';

/** An explicit owner action: preserve the roof design while fitting its peak to the chosen height. */
export function fitRoofHeight(
  edit: MapEdit,
  partId: string,
  height: number,
): MapEdit {
  const roof = edit.properties.appearance?.roofs?.[partId];
  if (!roof || !Number.isFinite(height) || height <= 0 || height > 150)
    return edit;
  const peak = Math.max(roof.eaves, ...roof.points.map((p) => p.elevation));
  if (!Number.isFinite(peak) || peak <= 0 || Math.abs(peak - height) < 0.00001)
    return edit;
  const ratio = height / peak;
  const appearance = structuredClone(edit.properties.appearance!);
  appearance.roofs![partId] = {
    ...roof,
    eaves: roof.eaves * ratio,
    points: roof.points.map((p) => ({ ...p, elevation: p.elevation * ratio })),
    provenance:
      `${roof.provenance || ''}\nRoof elevations proportionally fitted to an owner-selected ${height} m height; dimensions require review.`
        .trim()
        .slice(0, 2000),
  };
  for (const facade of Object.values(appearance.facades || {}))
    if (facade.partId === partId) {
      facade.needsReview = true;
      delete facade.reviewedAt;
    }
  return { ...edit, properties: { ...edit.properties, appearance } };
}

export function inheritsBuildingHeight(
  part: { height?: number; floors?: number; heightMode?: string } | undefined,
) {
  return (
    !part?.heightMode &&
    part?.height === undefined &&
    part?.floors === undefined
  );
}
