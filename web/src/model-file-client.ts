import type { ModelDocument } from './model-document';
import type {
  ModelExportOptions,
  ModelFile,
  ModelImport,
} from './model-file-types';
import type { ModelMesh } from './visual-types';
export function modelFileTask(
  payload: { kind: 'import'; files: ModelFile[]; primary: string },
  signal: AbortSignal,
): Promise<ModelImport>;
export function modelFileTask(
  payload: {
    kind: 'export';
    document: ModelDocument;
    options: ModelExportOptions;
    native?: ModelMesh[];
  },
  signal: AbortSignal,
): Promise<ModelFile[]>;
export function modelFileTask(
  payload: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(
      new URL('./model-file-worker.ts', import.meta.url),
      { type: 'module' },
    );
    const abort = () => {
      worker.terminate();
      reject(
        new Error('File operation cancelled. Your building is unchanged.'),
      );
    };
    signal.addEventListener('abort', abort, { once: true });
    const done = () => {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    worker.onmessage = ({ data }) => {
      done();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      done();
      reject(
        new Error(
          'The model file could not be processed. Check its format, size, and dependencies.',
        ),
      );
    };
    worker.postMessage(payload);
  });
}
