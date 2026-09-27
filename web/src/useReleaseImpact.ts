import { useEffect, useState } from 'react';
import type { CampusData } from './types';
import type { ReleaseImpact } from './release-impact';
import { processes } from './process-monitor';
export function useReleaseImpact(
  published: CampusData,
  draft: CampusData,
  enabled: boolean,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    published: CampusData;
    draft: CampusData;
    attempt: number;
    result?: ReleaseImpact;
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) return;
    const progress = processes.begin(
      'Release impact',
      'Comparing destinations, routes and model changes',
    );
    let settled = false;
    const worker = new Worker(
      new URL('./release-impact.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const fail = (message: string) => {
      settled = true;
      progress.fail(new Error(message));
      worker.terminate();
      setState({ published, draft, attempt, error: message });
    };
    const timeout = setTimeout(
      () => fail('Impact review timed out. Retry the review.'),
      30_000,
    );
    worker.onmessage = (event) => {
      settled = true;
      if (event.data.error) progress.fail(new Error(event.data.error));
      else progress.finish('Release impact ready');
      clearTimeout(timeout);
      setState({ published, draft, attempt, ...event.data });
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      fail('Impact review could not finish. Retry the review.');
    };
    worker.postMessage({ published, draft });
    return () => {
      if (!settled)
        progress.fail(
          new DOMException(
            'Comparison replaced by a newer draft',
            'AbortError',
          ),
        );
      clearTimeout(timeout);
      worker.terminate();
    };
  }, [published, draft, enabled, attempt]);
  const current =
    state?.published === published &&
    state?.draft === draft &&
    state?.attempt === attempt;
  return {
    pending: enabled && !current,
    result: current ? state.result : undefined,
    error: current ? state.error : undefined,
    retry: () => setAttempt((n) => n + 1),
  };
}
