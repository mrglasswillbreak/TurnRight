/// <reference lib="webworker" />
import { importModelFiles } from './model-file-import';
import { exportModel } from './model-file-export';
import type { ModelDocument } from './model-document';
import type { ModelExportOptions, ModelFile } from './model-file-types';
import type { ModelMesh } from './visual-types';
import { handleModelImageReply } from './model-image-codec';
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (
  event: MessageEvent<
    | { kind: 'import'; files: ModelFile[]; primary: string }
    | {
        kind: 'export';
        document: ModelDocument;
        options: ModelExportOptions;
        native?: ModelMesh[];
      }
  >,
) => {
  if (handleModelImageReply(event.data as { imageReply?: number })) return;
  try {
    const r = event.data,
      result =
        r.kind === 'import'
          ? await importModelFiles(r.files, r.primary)
          : await exportModel(r.document, r.options, r.native);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
