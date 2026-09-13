import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { applyEdits } from './editor-model';
import type { CampusData, MapEdit } from './types';
import { RevisionWorker } from './revision-worker';
import type { DuplicateCandidate } from './duplicates';

type Validation = ReturnType<typeof applyEdits> & {
  duplicates: DuplicateCandidate[];
};
export function retainCampusSources(
  previous: CampusData,
  next: CampusData,
): CampusData {
  // Worker replies have new identities even when only a place name changed.
  for (const key of [
    'map',
    'graph',
    'boundary',
    'places',
    'closures',
    'entrances',
  ] as const) {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key]))
      Object.assign(next, { [key]: previous[key] });
  }
  return next;
}
export function useEditorValidation(base: CampusData, edits: MapEdit[]) {
  const worker = useRef<RevisionWorker<
    CampusData,
    MapEdit[],
    Validation
  > | null>(null);
  const latest = useRef({ base, edits });
  latest.current = { base, edits };
  const [state, setState] = useState<{
    base: CampusData;
    edits: MapEdit[] | null;
    result: Validation;
  }>({
    base,
    edits: null,
    result: { data: base, errors: [], warnings: [], duplicates: [] },
  });
  useEffect(() => {
    const client = new RevisionWorker<CampusData, MapEdit[], Validation>(
      new Worker(new URL('./editor-validation.worker.ts', import.meta.url), {
        type: 'module',
      }),
    );
    worker.current = client;
    return () => {
      client.close();
      worker.current = null;
    };
  }, []);
  const check = useCallback(
    (snapshot: MapEdit[]) => {
      if (!worker.current)
        return Promise.reject(
          new Error('Validation is starting. Please try again.'),
        );
      return worker.current.request(base, snapshot);
    },
    [base],
  );
  useEffect(() => {
    let cancelled = false;
    void check(edits)
      .then((result) => {
        if (
          !cancelled &&
          latest.current.base === base &&
          latest.current.edits === edits
        )
          setState((previous) => ({
            base,
            edits,
            result: {
              ...result,
              data: retainCampusSources(previous.result.data, result.data),
            },
          }));
      })
      .catch((error) => {
        if (
          !cancelled &&
          latest.current.base === base &&
          latest.current.edits === edits
        )
          setState({
            base,
            edits,
            result: {
              data: base,
              errors: [(error as Error).message],
              warnings: [],
              duplicates: [],
            },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [base, edits, check]);
  return useMemo(
    () => ({
      ...state.result,
      data: state.base === base ? state.result.data : base,
      pending: state.base !== base || state.edits !== edits,
      check,
    }),
    [state, base, edits, check],
  );
}
