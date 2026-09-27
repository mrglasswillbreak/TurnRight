/// <reference lib="webworker" />
import { processPhoto } from './photo-processing-local';
self.onmessage = async ({ data }) => {
  try {
    const result = await processPhoto(data.file, data.recipe, (stage) =>
      self.postMessage({ stage }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
