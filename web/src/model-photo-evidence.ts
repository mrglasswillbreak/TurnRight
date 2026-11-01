import type { ModelImage } from './model-document.js';

export function validModelPhotoEvidence(value: ModelImage['evidence']) {
  if (
    !value ||
    typeof value.photoId !== 'string' ||
    !value.photoId ||
    value.photoId.length > 240 ||
    typeof value.modifications !== 'string' ||
    !value.modifications ||
    value.modifications.length > 4000 ||
    !Array.isArray(value.corners) ||
    value.corners.length !== 4 ||
    value.corners.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n) => !Number.isFinite(n) || n < 0 || n > 1),
    )
  )
    return false;
  return value.corners.every((a, i, r) => {
    const b = r[(i + 1) % 4],
      c = r[(i + 2) % 4];
    return (
      (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0.00001
    );
  });
}
