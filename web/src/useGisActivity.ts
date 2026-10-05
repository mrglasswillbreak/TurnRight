import { useEffect } from 'react';
import { gisApi } from './gis-api';
import { processes } from './process-monitor';
/** Feed campus GIS jobs into the existing upload/import/release activity drawer. */
export function useGisActivity() {
  useEffect(() => {
    let disposed = false,
      running = false;
    const poll = async () => {
      if (disposed || running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const jobs = await gisApi('gis-jobs', {});
        if (disposed || !Array.isArray(jobs)) return;
        processes.batch(() =>
          jobs.forEach((job) =>
            processes.set({
              id: 'gis:' + job.id,
              title: job.request.name,
              stage: job.message || job.status,
              started: Date.parse(job.created_at),
              completed: job.progress,
              total: 100,
              unit: '%',
              state:
                job.status === 'queued'
                  ? 'waiting'
                  : job.status === 'running'
                    ? 'running'
                    : job.status === 'failed'
                      ? 'failed'
                      : job.status === 'cancelled'
                        ? 'cancelled'
                        : 'complete',
            }),
          ),
        );
      } catch {
        /* Jobs retain their last known stage; Analyze exposes retries and errors. */
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
}
