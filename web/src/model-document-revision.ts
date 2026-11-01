import type { ModelDocument } from './model-document.js';
import { modelDocumentFingerprint } from './model-document-fingerprint.js';
const revisions = new WeakMap<ModelDocument, string>();
/** Optional extension: absent authored geometry must never change legacy fingerprints. */
export function modelDocumentRevision(document: ModelDocument) {
  const previous = revisions.get(document);
  if (previous) return previous;
  const revision = modelDocumentFingerprint(document);
  revisions.set(document, revision);
  return revision;
}
