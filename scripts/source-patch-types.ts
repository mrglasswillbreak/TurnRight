import type { SourceRecord } from '../web/src/editor-model.js';

/** Additions carry a complete payload; existing sources carry only changed fields. */
export type AdditiveSourcePatch = Pick<
  SourceRecord,
  'id' | 'entity' | 'source' | 'hash'
> &
  (
    | { payload: SourceRecord['payload'] }
    | {
        payload_patch: Record<string, unknown>;
        properties_patch?: Record<string, unknown>;
      }
  );
