// A reuse license does not establish that an image records a real building.
export function syntheticPhotoEvidence(info) {
  const text = JSON.stringify({
    metadata: info?.metadata,
    commonmetadata: info?.commonmetadata,
    extmetadata: info?.extmetadata,
  });
  return /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicallyEnhanced|generative[ _-]?AI|AI[ _-]?generated|Made with Google AI/i.test(
    text,
  );
}

export function requirePhotographicSource(page, audit) {
  const source = audit?.imageinfo?.[0];
  if (!source || !Array.isArray(source.commonmetadata) || source.sha1 !== page.imageinfo?.[0]?.sha1)
    throw Error(`Original source metadata audit missing or stale: ${page.title}`);
  if (syntheticPhotoEvidence(source))
    throw Error(`Synthetic image cannot be published as a building photograph: ${page.title}`);
}
