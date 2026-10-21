import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { api } from './supabase';
import type { CampusImport, ImportConfiguration } from './map-import-types';
import { suggestMappings } from './campus-import-configuration';

export interface ImportPolling {
  job: CampusImport | null;
  setJob: Dispatch<SetStateAction<CampusImport | null>>;
  setConfiguration: Dispatch<SetStateAction<ImportConfiguration>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

/** One status request at a time, scoped to the currently open import. */
export function useCampusImportPolling({
  job,
  setJob,
  setConfiguration,
  setNotice,
  setError,
}: ImportPolling) {
  const id = job?.id;
  const active = !!job && ['running', 'queued'].includes(job.status);
  useEffect(() => {
    if (!active || !id) return;
    const controller = new AbortController();
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const { job: next } = await api<{ job: CampusImport }>(
          'import-get',
          { importId: id, statusOnly: true },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setJob((current) => (current?.id === id ? next : current));
        if (next.status === 'reviewed')
          setNotice(
            'Changes are queued. Review source changes before publishing.',
          );
        if (next.status === 'mapping') setConfiguration(suggestMappings(next));
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not refresh import status.',
          );
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, 4000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, id, setJob, setConfiguration, setNotice, setError]);
}
