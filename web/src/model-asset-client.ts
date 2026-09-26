import type { MapEdit } from './types';
import {
  modelDocumentErrors,
  MODEL_LIMITS,
  type ModelDocument,
  type ModelAssetReference,
} from './model-document';
type Api = <T>(action: string, payload: unknown) => Promise<T>;
type SavePayload = {
  edits: Array<{ edit: MapEdit; [key: string]: unknown }>;
  [key: string]: unknown;
};
type ModelResponse = { edits?: MapEdit[]; published?: { edits?: MapEdit[] } };
const assets = new Map<string, ModelAssetReference>(),
  documents = new Map<string, ModelDocument>();
function boundedSet<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
}
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
export async function prepareModelSave(
  input: unknown,
  api: Api,
  ownerKey: string,
) {
  const payload = input as SavePayload;
  const edits = [];
  for (const item of payload.edits) {
    let edit = item.edit as MapEdit;
    const doc = edit.properties.modelDocument;
    if (doc) {
      const errors = modelDocumentErrors(doc);
      if (errors.length) throw new Error(errors.join(' '));
      const bytes = new TextEncoder().encode(JSON.stringify(doc)),
        sha256 = await digest(bytes),
        key = `${ownerKey}:${sha256}`;
      if (bytes.length > MODEL_LIMITS.documentBytes)
        throw new Error(
          'The model exceeds 25 MiB. Reduce geometry or textures; your local draft is retained.',
        );
      let reference = assets.get(key);
      if (!reference) {
        const begin = await api<{
          reference: ModelAssetReference;
          url?: string;
          ready: boolean;
        }>('model-asset-begin', { sha256, bytes: bytes.byteLength });
        reference = begin.reference;
        if (!begin.ready) {
          const response = await fetch(begin.url!, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-upsert': 'false',
            },
            body: bytes,
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok && response.status !== 409)
            throw new Error(
              'Model upload interrupted. Your local draft is retained.',
            );
          await api('model-asset-confirm', { reference });
        }
        boundedSet(assets, key, reference);
        boundedSet(documents, `${ownerKey}:${reference.id}`, doc);
      }
      const properties = { ...edit.properties, modelDocumentAsset: reference };
      delete properties.modelDocument;
      edit = { ...edit, properties };
    }
    edits.push({ ...item, edit });
  }
  return { ...payload, modelDocumentVersion: 1, edits };
}
export async function hydrateModelResponse<T>(
  value: T,
  api: Api,
  ownerKey: string,
): Promise<T> {
  const envelope = value as ModelResponse;
  const edits: MapEdit[] | undefined = Array.isArray(value)
    ? value
    : envelope?.edits;
  if (!Array.isArray(edits)) return value;
  const hydrated = [];
  for (const edit of edits) {
    const reference = edit?.properties?.modelDocumentAsset as
      | ModelAssetReference
      | undefined;
    if (!reference) {
      hydrated.push(edit);
      continue;
    }
    const key = `${ownerKey}:${reference.id}`;
    let doc = documents.get(key);
    if (!doc) {
      const signed = await api<{ url: string }>('model-asset-read', {
        reference,
      });
      const response = await fetch(signed.url, {
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error(
          'Could not load the private model. Retry while online; your local draft remains available.',
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.length !== reference.bytes ||
        (await digest(bytes)) !== reference.sha256
      )
        throw new Error('The model asset failed its integrity check.');
      doc = JSON.parse(new TextDecoder().decode(bytes));
      const errors = modelDocumentErrors(doc);
      if (errors.length) throw new Error(errors.join(' '));
      boundedSet(documents, key, doc!);
      boundedSet(assets, `${ownerKey}:${reference.sha256}`, reference);
    }
    hydrated.push({
      ...edit,
      properties: { ...edit.properties, modelDocument: doc },
    });
  }
  const published = envelope?.published?.edits
    ? await hydrateModelResponse(envelope.published, api, ownerKey)
    : envelope?.published;
  return (
    Array.isArray(value)
      ? hydrated
      : { ...value, edits: hydrated, ...(published ? { published } : {}) }
  ) as T;
}
