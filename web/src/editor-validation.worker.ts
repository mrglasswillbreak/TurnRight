/// <reference lib="webworker" />
import { applyEdits } from './editor-model';
import { findDuplicateCandidates } from './duplicates';
import type { CampusData, MapEdit } from './types';
import type { RevisionRequest } from './revision-worker';
let base: CampusData | undefined;
let revision = 0;
self.onmessage = (event: MessageEvent<RevisionRequest<CampusData, MapEdit[]>>) => {
  const message = event.data;
  if (message.type === 'init') { base = message.data; revision = message.revision; return; }
  const { id } = message;
  try {
    if (!base || message.revision !== revision) throw new Error('Validation needs the current campus map.');
    const result = applyEdits(base, message.payload);
    self.postMessage({ id, revision, result: { ...result, duplicates: findDuplicateCandidates(result.data, message.payload) } });
  } catch (error) {
    self.postMessage({ id, revision: message.revision, error: error instanceof Error ? error.message : 'Could not validate this draft.' });
  }
};
