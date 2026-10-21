import { photoDetailErrors } from './photo-details';
import { type PhotoManagerState } from './usePhotoManager.js';
export function markPhotoReady({
  job,
  gallery,
  queue,
  setError,
  setFieldErrors,
  panel,
  store,
  target,
  optimizing,
  setSelected,
}: Pick<
  PhotoManagerState,
  | 'job'
  | 'gallery'
  | 'queue'
  | 'setError'
  | 'setFieldErrors'
  | 'panel'
  | 'store'
  | 'target'
  | 'optimizing'
  | 'setSelected'
>): void {
  if (!job) return;
  if (
    [
      ...gallery,
      ...queue.jobs
        .filter((j) => j.key !== job.key && j.state === 'ready')
        .map((j) => j.metadata),
    ].some(
      (p) =>
        p.sha256 === job.metadata.sha256 &&
        p.buildingId === job.metadata.buildingId &&
        p.entranceId === job.metadata.entranceId &&
        p.id !== job.original?.id,
    )
  ) {
    setError(
      'This photograph is already in this gallery or the ready queue. Remove the duplicate from the queue.',
    );
    return;
  }
  const errors = photoDetailErrors(job.metadata);
  setFieldErrors(errors);
  if (Object.keys(errors).length) {
    requestAnimationFrame(() => {
      const invalid = panel.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      const section = invalid?.closest('details');
      if (section) section.open = true;
      invalid?.focus();
    });
    return;
  }
  if (
    !job.reviewed ||
    !job.rightsReviewed ||
    (job.metadata.sourceKind === 'author-upload' && !job.authorshipConfirmed)
  ) {
    setError(
      'Confirm the photo identity, visual quality and applicable authorship or reuse rights.',
    );
    return;
  }
  queue.patch(job.key, { state: 'ready' });
  setError('');
  const next = store
    .snapshot(target)
    .find((j) => j.key !== job.key && j.state === 'needs details');
  if (next && !optimizing) setSelected(next.key);
}
