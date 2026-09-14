/// <reference lib="webworker" />
import { releaseImpact } from './release-impact';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: releaseImpact(data.published, data.draft) });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
