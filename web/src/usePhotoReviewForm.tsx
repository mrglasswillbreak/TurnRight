import { useMemo } from 'react';
import { photoLicenses } from './arrival';
import { samePhotoRights } from './photo-details';
import type { CampusPhoto } from './types';
import { PhotoImage } from './photo-manager-cards';
import type { PhotoManagerState } from './usePhotoManager';
export function usePhotoReviewForm({
  index,
  buildingError,
  chosenBuilding,
  change,
  job,
  fieldErrors,
  patch,
  editable,
  setOptimizing,
  queueOrder,
  setSelected,
  attaching,
  shared,
  update,
  markReady,
}: Pick<
  PhotoManagerState,
  | 'index'
  | 'buildingError'
  | 'chosenBuilding'
  | 'change'
  | 'job'
  | 'fieldErrors'
  | 'patch'
  | 'editable'
  | 'setOptimizing'
  | 'queueOrder'
  | 'setSelected'
  | 'attaching'
  | 'shared'
  | 'update'
  | 'markReady'
>): import('react').ReactNode {
  const buildingOptions = useMemo(
    () =>
      index.options.map((b) => (
        <option key={b.id} value={b.id}>
          {b.label}
        </option>
      )),
    [index],
  );
  const buildingPicker = useMemo(
    () => (
      <label className="field-label">
        Pictured building
        <select
          aria-label="Pictured building"
          aria-invalid={!!buildingError}
          value={chosenBuilding || ''}
          onChange={(e) => change('buildingId', e.target.value)}
        >
          <option value="">Choose building</option>
          {buildingOptions}
        </select>
        {buildingError && <span className="photo-error">{buildingError}</span>}
      </label>
    ),
    [chosenBuilding, buildingError, buildingOptions, change],
  );
  const reviewForm = useMemo(() => {
    const field = (label: string, key: keyof CampusPhoto, type = 'text') => (
      <label className="field-label" key={key}>
        {label}
        <input
          aria-label={label}
          type={type}
          value={String(job?.metadata[key] || '')}
          aria-invalid={!!fieldErrors[key]}
          aria-describedby={fieldErrors[key] ? `photo-error-${key}` : undefined}
          onChange={(e) => change(key, e.target.value || undefined)}
        />
        {fieldErrors[key] && (
          <span id={`photo-error-${key}`} className="photo-error">
            {fieldErrors[key]}
          </span>
        )}
      </label>
    );
    return (
      job && (
        <section className="photo-review-form" aria-label="Photo details">
          <PhotoImage
            key={job.key}
            className="photo-review-image"
            photo={{
              ...job.metadata,
              id: job.mediaId ? `owner:${job.mediaId}` : job.metadata.id,
              url: job.previewUrl,
              alt: job.metadata.alt || 'Photo awaiting review',
            }}
            onUrl={(url) => patch(job.key, { previewUrl: url })}
          />
          <div className="photo-actions">
            <button
              disabled={
                !editable || ['uploading', 'processing'].includes(job.state)
              }
              onClick={() =>
                setOptimizing({
                  localId: job.localImageId,
                  photo: job.localImageId
                    ? undefined
                    : job.metadata.sha256 && job.previewUrl
                      ? ({
                          ...job.metadata,
                          url: job.previewUrl || job.metadata.url,
                        } as CampusPhoto)
                      : undefined,
                  metadata: job.metadata,
                  replacesJob: job.key,
                  original: job.original,
                })
              }
            >
              Edit &amp; optimise
            </button>
            <button
              disabled={queueOrder.indexOf(job.key) === 0}
              onClick={() =>
                setSelected(queueOrder[queueOrder.indexOf(job.key) - 1])
              }
            >
              Previous photo
            </button>
            <button
              disabled={queueOrder.indexOf(job.key) === queueOrder.length - 1}
              onClick={() =>
                setSelected(queueOrder[queueOrder.indexOf(job.key) + 1])
              }
            >
              Next photo
            </button>
          </div>
          {job.approved && (
            <p className="photo-notice">
              Approved privately. Add this photo to the map draft to finish. To
              revise these locked details, remove it from this queue and resume
              it from Private uploads.
            </p>
          )}
          <fieldset
            className="photo-body-controls"
            disabled={
              !!job.approved || !editable || attaching.includes(job.key)
            }
          >
            {field('Caption', 'caption')}
            {field('Image description (alternative text)', 'alt')}
            {buildingPicker}
            <label className="field-label">
              Photograph of
              <select
                aria-label="Photograph of"
                value={job.metadata.entranceId || ''}
                onChange={(e) =>
                  change('entranceId', e.target.value || undefined)
                }
              >
                <option value="">General building view</option>
                {(index.entrances.get(job.metadata.buildingId || '') || []).map(
                  (e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ),
                )}
              </select>
            </label>
            <details open={!job.original}>
              <summary>
                Source &amp; credits{' '}
                {job.original && samePhotoRights(job.metadata, job.original)
                  ? '· previously reviewed'
                  : ''}
              </summary>
              <label className="field-label">
                Photo source
                <select
                  aria-label="Photo source"
                  value={job.metadata.sourceKind || 'external'}
                  onChange={(e) => change('sourceKind', e.target.value)}
                >
                  <option value="external">Photo from another source</option>
                  <option
                    value="author-upload"
                    disabled={!!job.original && !job.mediaId}
                  >
                    I took this photo
                  </option>
                </select>
              </label>
              {field('Photographer / public credit', 'author')}
              {job.metadata.sourceKind === 'author-upload' ? (
                <label>
                  <input
                    type="checkbox"
                    checked={job.authorshipConfirmed}
                    onChange={(e) =>
                      patch(job.key, {
                        authorshipConfirmed: e.target.checked,
                        state: ['queued', 'uploading', 'processing'].includes(
                          job.state,
                        )
                          ? job.state
                          : 'needs details',
                      })
                    }
                  />
                  I took this photograph and choose to share it under the
                  selected license.
                </label>
              ) : (
                field('Original source page', 'sourceUrl', 'url')
              )}
              <label className="field-label">
                Reuse license
                <select
                  aria-label="Reuse license"
                  value={job.metadata.license || ''}
                  aria-invalid={!!fieldErrors.license}
                  onChange={(e) => change('license', e.target.value)}
                >
                  <option value="">Choose a verified license</option>
                  {photoLicenses.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                {fieldErrors.license && (
                  <span className="photo-error">{fieldErrors.license}</span>
                )}
              </label>
              {field(
                'License / public-domain evidence page',
                'licenseUrl',
                'url',
              )}
              {field('Required attribution', 'attribution')}
              <label>
                <input
                  type="checkbox"
                  checked={job.rightsReviewed}
                  onChange={(e) =>
                    patch(job.key, {
                      rightsReviewed: e.target.checked,
                      state: ['queued', 'uploading', 'processing'].includes(
                        job.state,
                      )
                        ? job.state
                        : 'needs details',
                    })
                  }
                />
                I checked the author, source and permission for offline
                redistribution.
              </label>
              <button
                disabled={!shared.length}
                onClick={() =>
                  update((items) =>
                    items.map((item) =>
                      shared.includes(item.key) &&
                      !attaching.includes(item.key) &&
                      !item.approved &&
                      item.key !== job.key
                        ? {
                            ...item,
                            metadata: {
                              ...item.metadata,
                              author: job.metadata.author,
                              license: job.metadata.license,
                              licenseUrl: job.metadata.licenseUrl,
                              attribution: job.metadata.attribution,
                            },
                            reviewed: false,
                            rightsReviewed: false,
                            authorshipConfirmed: false,
                            state: [
                              'queued',
                              'uploading',
                              'processing',
                            ].includes(item.state)
                              ? item.state
                              : 'needs details',
                          }
                        : item,
                    ),
                  )
                }
              >
                Apply these author/license details to {shared.length} selected
                uploads
              </button>
            </details>
            <details>
              <summary>Dates &amp; historical view</summary>
              {field('Capture date (if known)', 'capturedAt', 'date')}
              {field('Source checked', 'checkedAt', 'date')}
              <label>
                <input
                  type="checkbox"
                  checked={!!job.metadata.historical}
                  onChange={(e) => change('historical', e.target.checked)}
                />
                Historical view
              </label>
            </details>
            <label>
              <input
                type="checkbox"
                checked={job.reviewed}
                onChange={(e) =>
                  patch(job.key, {
                    reviewed: e.target.checked,
                    state: ['queued', 'uploading', 'processing'].includes(
                      job.state,
                    )
                      ? job.state
                      : 'needs details',
                  })
                }
              />
              I checked visual quality and the building / entrance identity.
            </label>
            <button
              className="photo-primary"
              disabled={
                !editable || attaching.includes(job.key) || !job.metadata.sha256
              }
              onClick={markReady}
            >
              Mark ready
            </button>
          </fieldset>
        </section>
      )
    );
  }, [
    job,
    fieldErrors,
    shared,
    index,
    buildingPicker,
    queueOrder,
    attaching,
    editable,
    patch,
    update,
    change,
    markReady,
    setOptimizing,
    setSelected,
  ]);
  return reviewForm;
}
