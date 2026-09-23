import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorValidation as Validation } from './editor-validation';
import type { ValidationIssue } from './validation';
import type { CampusData, MapEdit } from './types';
import { RevisionWorker } from './revision-worker';
import {
  LatestPreview,
  type ValidationDelta,
  type ValidationPayload,
} from './editor-validation-cache';
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
    ValidationPayload,
    ValidationDelta
  > | null>(null);
  const previews = useRef(new LatestPreview());
  const decoded = useRef<{
    base: CampusData;
    data: CampusData;
    sequence: number;
  }>({ base, data: base, sequence: 0 });
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
    const client = new RevisionWorker<
      CampusData,
      ValidationPayload,
      ValidationDelta
    >(
      new Worker(new URL('./editor-validation.worker.ts', import.meta.url), {
        type: 'module',
      }),
    );
    worker.current = client;
    previews.current = new LatestPreview();
    decoded.current = {
      base: latest.current.base,
      data: latest.current.base,
      sequence: 0,
    };
    return () => {
      client.close();
      previews.current.close();
      worker.current = null;
    };
  }, [attempt]);
  const check = useCallback(
    (snapshot: MapEdit[], full = true) => {
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
      return worker.current
        .request(base, { edits: snapshot, full })
        .then((result) => {
          const previous =
            decoded.current.base === base
              ? decoded.current
              : { base, data: base, sequence: 0 };
          if (result.sequence !== previous.sequence + 1)
            throw Error(
              'Validation response is out of sequence. Retry validation.',
            );
          const data = { ...previous.data, ...result.data } as CampusData;
          decoded.current = { base, data, sequence: result.sequence };
          return { ...result, data };
        });
    },
    [base, sourceIssues, attempt],
  );
  useEffect(() => {
    let cancelled = false;
    void previews.current
      .request(() => check(edits, false))
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
              data: result.usable ? result.data : previous.result.data,
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
