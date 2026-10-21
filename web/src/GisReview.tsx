import { useGisReview, type GisReviewProps } from './useGisReview';
import { GisQualityReview } from './GisQualityReview';
import { GisSubmissionReview } from './GisSubmissionReview';
import { GisMemberships } from './GisMemberships';

export default function GisReview(props: GisReviewProps) {
  const viewState = useGisReview(props);
  const { membershipsOnly } = viewState;

  return (
    <>
      {!membershipsOnly && (
        <>
          <GisQualityReview state={viewState} />
          <GisSubmissionReview state={viewState} />
        </>
      )}
      <GisMemberships state={viewState} />
    </>
  );
}
