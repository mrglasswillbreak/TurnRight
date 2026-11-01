/** Shared by the browser and the plain-Node public package sanitizer. */
export function modelDocumentFingerprint(document) {
  const input = JSON.stringify(document);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 3266489917);
  }
  return `model1-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${input.length}`;
}
