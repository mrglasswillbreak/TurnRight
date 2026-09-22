/** Presentation only: these classifications never grant access or add connections. */
const normalized = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';

export function landClass(properties: Record<string, unknown>) {
  const name = normalized(properties.name).replace(/\s/g, '');
  if (['water', 'waterbody'].includes(name)) return 'water';
  if (name.includes('wetland')) return 'wetland';
  if (['greenarea', 'vegetation', 'forest'].includes(name)) return 'green';
  if (name === 'baresurface') return 'bare';
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
