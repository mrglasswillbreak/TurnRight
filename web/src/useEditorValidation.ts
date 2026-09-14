import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorValidation as Validation } from './editor-validation';
import type { ValidationIssue } from './validation';
import type { CampusData, MapEdit } from './types';
import { RevisionWorker } from './revision-worker';
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
    'visuals',
  ] as const) {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key]))
      Object.assign(next, { [key]: previous[key] });
  }
  return next;
}
const noIssues: ValidationIssue[] = [];
export function useEditorValidation(
  base: CampusData,
  edits: MapEdit[],
  fallback = base,
  sourceIssues = noIssues,
) {
  const [attempt, setAttempt] = useState(0);
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
    result: {
      data: fallback,
      errors: [],
      warnings: [],
      duplicates: [],
      issues: [],
      revision: 0,
      failed: false,
      usable: true,
    },
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
  }, [attempt]);
  const check = useCallback(
    (snapshot: MapEdit[]) => {
      if (sourceIssues.length)
        return Promise.resolve({
          data: base,
          errors: sourceIssues.map((i) => i.message),
          warnings: [],
          duplicates: [],
          issues: sourceIssues,
          revision: attempt,
          failed: false,
          usable: false,
        } satisfies Validation);
      if (!worker.current)
        return Promise.reject(
          new Error('Validation is starting. Please try again.'),
        );
      return worker.current.request(base, snapshot);
    },
    [base, sourceIssues, attempt],
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
              data: result.usable
                ? retainCampusSources(previous.result.data, result.data)
                : previous.result.data,
            },
          }));
      })
      .catch((error) => {
        if (
          !cancelled &&
          latest.current.base === base &&
          latest.current.edits === edits
        )
          setState((previous) => ({
            base,
            edits,
            result: {
              data: previous.result.data,
              errors: [(error as Error).message],
              warnings: [],
              duplicates: [],
              issues: [
                {
                  code: 'worker-crash',
                  phase: 'worker',
                  message: (error as Error).message,
                },
              ],
              revision: attempt,
              failed: true,
              usable: false,
            },
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [base, edits, check, attempt]);
  return useMemo(
    () => ({
      ...state.result,
      data: state.result.data,
      pending: state.base !== base || state.edits !== edits,
      check,
      retry: () => {
        setState((previous) => ({ ...previous, edits: null }));
        setAttempt((n) => n + 1);
      },
    }),
    [state, base, edits, check],
  );
}
