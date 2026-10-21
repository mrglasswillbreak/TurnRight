import { useEffect, useMemo, useState, type RefObject } from 'react';
import { campusFacadeReviewIssues } from './building-facades';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData, MapChange, MapEdit } from './types';
import { api } from './supabase';
import { AdminRequestError } from './admin-client';
import { useReleaseImpact } from './useReleaseImpact';
import { type ValidationIssue } from './validation';
import type { EditorWorkspace } from './editor-workspace';
import type { EditorValidation } from './editor-validation';
import type { PublishedWorkspace } from './editor-publication';
import { ReviewState } from './editor-review-state';

export type EditorReviewProps = {
  tab: string;
  state: ReviewState;
  workspace: EditorWorkspace;
  validation: EditorValidation & { pending?: boolean; retry: () => void };
  baselineVersion: string;
  publishedVersion: string;
  published: CampusData;
  onIssue: (issue: ValidationIssue) => void;
  onSignIn: () => Promise<void>;
  busy: boolean;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
  mapRef: RefObject<MapInstance | null>;
  preview: boolean;
  setPreview: (value: boolean) => void;
  review: MapChange | null;
  setReview: (change: MapChange) => void;
  onApplyAppearances: (batch: MapEdit[]) => Promise<void>;
  onLocateBuilding: (id: string) => void;
  onPublishedWorkspace: (published: PublishedWorkspace | null) => void;
  draftCount: number;
};
export function useEditorReview({
  tab,
  state,
  workspace,
  validation,
  baselineVersion,
  publishedVersion,
  published,
  onIssue,
  onSignIn,
  busy,
  action,
  mapRef,
  preview,
  setPreview,
  onApplyAppearances,
  onLocateBuilding,
  onPublishedWorkspace,
  draftCount,
}: EditorReviewProps) {
  const [summary, setSummary] = useState('');

  const modelReviews = useMemo(
    () => campusFacadeReviewIssues(validation.data),
    [validation.data],
  );

  const [liveState, setLiveState] = useState(state);

  const [statusError, setStatusError] = useState<Error | null>(null);

  const [statusAttempt, setStatusAttempt] = useState(0);

  const impact = useReleaseImpact(
    published,
    validation.data,
    tab === 'releases' && !validation.pending,
  );

  useEffect(() => {
    if (tab !== 'releases') {
      setLiveState(state);
      return;
    }
    setLiveState({ ...state, changes: [], hasMoreChanges: false });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const latest = await api<
            Pick<
              ReviewState,
              'jobs' | 'releases' | 'changes' | 'hasMoreChanges' | 'published'
            >
          >('review-status', {
            omitChanges: true,
          });
          if (!cancelled) {
            setLiveState((current) => ({ ...current, ...latest }));
            if (latest.published !== undefined)
              onPublishedWorkspace(latest.published);
            setStatusError(null);
          }
        } catch (e) {
          if (!cancelled) setStatusError(e as Error);
          if (e instanceof AdminRequestError && e.reason === 'auth') return;
        }
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, tab, statusAttempt, onPublishedWorkspace]);
  return {
    statusError,
    onSignIn,
    setStatusAttempt,
    tab,
    mapRef,
    validation,
    workspace,
    busy,
    onApplyAppearances,
    onLocateBuilding,
    state,
    action,
    draftCount,
    baselineVersion,
    publishedVersion,
    modelReviews,
    onIssue,
    setPreview,
    preview,
    impact,
    summary,
    setSummary,
    liveState,
  };
}
export type EditorReviewState = ReturnType<typeof useEditorReview>;
