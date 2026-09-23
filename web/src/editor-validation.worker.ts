/// <reference lib="webworker" />
import {
  EditorValidationCache,
  ValidationTransport,
  type ValidationPayload,
} from './editor-validation-cache';
import type { CampusData } from './types';
import type { RevisionRequest } from './revision-worker';
let base: CampusData | undefined;
let revision = 0;
let validator: EditorValidationCache;
let transport: ValidationTransport;
self.onmessage = (
  event: MessageEvent<RevisionRequest<CampusData, ValidationPayload>>,
) => {
  const message = event.data;
  if (message.type === 'init') {
    base = message.data;
    revision = message.revision;
    validator = new EditorValidationCache(base, revision);
    transport = new ValidationTransport();
    return;
  }
  const { id } = message;
  try {
    if (!base || message.revision !== revision)
      throw new Error('Validation needs the current campus map.');
    const result = transport.encode(
      validator.validate(message.payload.edits, message.payload.full),
    );
    self.postMessage({
      id,
      revision,
      result,
    });
  } catch (error) {
    self.postMessage({
      id,
      revision: message.revision,
      error:
        error instanceof Error
          ? error.message
          : 'Could not validate this draft.',
    });
  }
};
