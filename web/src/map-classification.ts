/** Presentation only: these classifications never grant access or add connections. */
const normalized = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';

export function landClass(properties: Record<string, unknown>) {
  if (['water','wetland','green','bare','developed','road','sidewalk','parking','sports','parcel'].includes(String(properties.landClass))) return String(properties.landClass);
  const name = normalized(properties.landUse || properties.name).replace(/[^a-z0-9]/g, '');
  if (/wetland|marsh|swamp/.test(name)) return 'wetland';
  if (/water|lagoon|lake|river|pond/.test(name)) return 'water';
  if (/green|vegetation|forest|treeline|hedgerow|shrubline|grass|garden/.test(name)) return 'green';
  if (/sidewalk|footway|pedestrian/.test(name)) return 'sidewalk';
  if (/carpark|parking/.test(name)) return 'parking';
  if (/drivepaved|driveunpaved|tarredroad|untarredroad/.test(name)) return 'road';
  if (/sport|pitch|court|stadium/.test(name)) return 'sports';
  if (/baresurface|sand/.test(name)) return 'bare';
  return 'developed';
}

export function pathDisplay(properties: Record<string, unknown>) {
  const tags = (properties.sourceTags || {}) as Record<string, unknown>;
  const highway = normalized(properties.highway || tags.highway);
  const service = normalized(properties.service || tags.service);
  const surface = normalized(properties.surface || tags.surface);
  const pedestrian = ['footway', 'path', 'pedestrian', 'steps'].includes(
    highway,
  );
  // Editor-created paths without a recorded highway are pedestrian paths.
  const pathClass =
    pedestrian || !highway
      ? 'footway'
      : service === 'parking_aisle'
        ? 'parking'
        : ['residential', 'primary', 'secondary', 'tertiary'].includes(highway)
          ? 'street'
          : 'service';
  const name = String(properties.name ?? tags.name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return {
    pathClass,
    unpaved: [
      'unpaved',
      'dirt',
      'earth',
      'ground',
      'gravel',
      'sand',
      'grass',
    ].includes(surface),
    streetLabel: /^(campus path|campus road|path|road|unnamed|unnamed road)$/i.test(name)
      ? ''
      : name,
  };
}
