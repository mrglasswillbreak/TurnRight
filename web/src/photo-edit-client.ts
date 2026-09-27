import type { PhotoRecipe } from './photo-edit';
import type { PhotoOutput } from './photo-processing-local';
import { processes } from './process-monitor';
export async function editPhotoTask(
  file: Blob,
  recipe: PhotoRecipe,
  signal: AbortSignal,
  title = 'Optimise photograph',
): Promise<PhotoOutput> {
  const process = processes.begin(title, 'Preparing image');
  try {
    signal.throwIfAborted();
    const result =
      typeof OffscreenCanvas === 'undefined'
        ? await (
            await import('./photo-processing-local')
          ).processPhoto(file, recipe, (s) => process.update(s), signal)
        : await new Promise<PhotoOutput>((resolve, reject) => {
            const worker = new Worker(
              new URL('./photo-edit.worker.ts', import.meta.url),
              { type: 'module' },
            );
            const done = () => {
              worker.terminate();
              signal.removeEventListener('abort', abort);
            };
            const abort = () => {
              done();
              reject(
                new DOMException(
                  'Image processing cancelled. Original retained.',
                  'AbortError',
                ),
              );
            };
            signal.addEventListener('abort', abort, { once: true });
            worker.onmessage = ({ data }) => {
              if (data.stage) {
                process.update(data.stage);
                return;
              }
              done();
              if (data.error) reject(Error(data.error));
              else resolve(data.result);
            };
            worker.onerror = () => {
              done();
              reject(Error('Image processing failed. Try a smaller image.'));
            };
            worker.postMessage({ file, recipe });
          });
    process.finish('Optimised locally');
    return result;
  } catch (error) {
    process.fail(error);
    throw error;
  }
}
