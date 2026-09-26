import type { ModelDocument } from './model-document.js';
const revisions = new WeakMap<ModelDocument, string>();
/** Optional extension: absent authored geometry must never change legacy fingerprints. */
export function modelDocumentRevision(document: ModelDocument) {
  const previous = revisions.get(document);
  if (previous) return previous;
  const input = JSON.stringify(document);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 3266489917);
  }
  const revision = `model1-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${input.length}`;
  revisions.set(document, revision);
  return revision;
}
