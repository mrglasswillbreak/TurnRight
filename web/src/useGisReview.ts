import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  CampusMembership,
  GisActionMap,
  QualityIssue,
  ReviewSubmission,
  WorkspaceRole,
} from './gis-types';
import type { ValidationIssue } from './validation';
import { gisApi } from './gis-api';
import { showGisPage, focusGisFeature } from './gis-map';

export type GisReviewProps = GisPanelProps & {
  membershipsOnly?: boolean;
  issues: ValidationIssue[];
  onIssue: (i: ValidationIssue) => void;
};
export function useGisReview({
  membershipsOnly = false,
  capabilities,
  mutate,
  issues,
  onIssue,
  map,
}: GisReviewProps) {
  const [reviews, setReviews] = useState<ReviewSubmission[]>([]),
    [qa, setQa] = useState<QualityIssue[]>([]),
    [members, setMembers] = useState<CampusMembership[]>([]),
    [summary, setSummary] = useState(''),
    [reason, setReason] = useState(''),
    [override, setOverride] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [details, setDetails] =
      useState<GisActionMap['gis-review-details']['response']>(),
    [memberId, setMemberId] = useState(''),
    [roles, setRoles] = useState<WorkspaceRole[]>(['editor']),
    [automated, setAutomated] = useState<QualityIssue[]>([]),
    [message, setMessage] = useState(''),
    [reviewDataset, setReviewDataset] = useState(''),
    [reviewPage, setReviewPage] =
      useState<GisActionMap['gis-review-query']['response']>();

  useEffect(() => {
    setReviewPage(undefined);
    setReviewDataset(details?.datasets?.[0]?.id || 'historical');
  }, [details]);

  useEffect(() => {
    if (!reviewPage || !map || !details) return;
    const dataset = details.datasets?.find((d) => d.id === reviewDataset) || {
      style: { mode: 'single' as const, color: '#2563eb' },
    };
    return showGisPage(map, dataset, reviewPage.features, new Set(), (key) => {
      const feature = reviewPage.features.find((f) => f.id === key);
      if (feature) focusGisFeature(map, feature);
    });
  }, [reviewPage, map, reviewDataset, details]);

  const can = (cap: 'edit' | 'review' | 'manage') =>
    capabilities.capabilities.includes(cap);

  const load = async () => {
    const [r, q, m, a] = await Promise.all([
      gisApi('gis-reviews', {}),
      gisApi('gis-issues', {}),
      gisApi('gis-members', {}),
      gisApi('gis-quality', {}),
    ]);
    setReviews(r);
    setQa(q);
    setMembers(m);
    setAutomated(a);
  };

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);

  const attempt = async (work: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveIssue = (issue: QualityIssue) =>
    attempt(() =>
      mutate(() =>
        gisApi('gis-issue-save', { issue, expectedRevision: issue.revision }),
      ),
    );
  return {
    membershipsOnly,
    error,
    issues,
    onIssue,
    can,
    busy,
    attempt,
    mutate,
    automated,
    map,
    qa,
    saveIssue,
    members,
    message,
    setMessage,
    summary,
    setSummary,
    reviews,
    setDetails,
    details,
    reviewDataset,
    setReviewDataset,
    setReviewPage,
    reviewPage,
    reason,
    setReason,
    capabilities,
    override,
    setOverride,
    setMemberId,
    setRoles,
    memberId,
    roles,
  };
}
export type GisReviewState = ReturnType<typeof useGisReview>;
