/** Keep the legacy budget; three-LOD authored models receive bounded extra time. */
export function visualBuildTimeout(features) {
  if (!Array.isArray(features)) return 120000;
  const detailed = features.some((feature) => {
    if (feature?.properties?.kind !== 'building') return false;
    const document = feature.properties.modelDocument;
    return (
      document?.version === 1 &&
      Array.isArray(document.objects) &&
      document.objects.some((object) =>
        ['structure', 'facade', 'fine'].includes(object?.detailTier),
      )
    );
  });
  return detailed ? 300000 : 120000;
}
