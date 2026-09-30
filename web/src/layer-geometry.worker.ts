import { runGeometry } from './layer-geometry-engine';
self.onmessage = (event) => {
  try {
    self.postMessage({
      result: runGeometry(
        event.data.data,
        event.data.edits,
        event.data.request,
      ),
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
