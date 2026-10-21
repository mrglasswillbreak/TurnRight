import { Check, ChevronRight, Layers, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from './supabase';
import { mapFileAccept } from './map-formats';
import type { CampusImport } from './map-import-types';
import type { CampusWorkspaceState } from './useCampusWorkspace';
import { CampusImportMapping } from './CampusImportMapping';
import { CampusImportSummary } from './CampusImportSummary';
export function CampusImportJob({ state }: { state: CampusWorkspaceState }) {
  const {
    selectedSource,
    setJob,
    refresh,
    job,
    busy,
    filesChanged,
    startPhase,
    resumable,
    reviewBlocker,
    run,
    setUncertainReview,
    setNotice,
    uncertainReview,
    onReview,
  } = state;
  if (!job) return null;
  return (
    <>
      <div className="campus-title">
        <div>
          <span className="editor-eyebrow">IMPORT DATA</span>
          <h3>{selectedSource?.name || 'Map import'}</h3>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setJob(null);
            void refresh();
          }}
        >
          Back to sources
        </Button>
      </div>
      <ol className="import-steps">
        {['Upload / source', 'Map fields', 'Preview', 'Review'].map((s, i) => (
          <li
            key={s}
            className={
              i ===
              (job.status === 'draft' ||
              job.status === 'running' ||
              job.status === 'queued'
                ? 0
                : job.status === 'mapping'
                  ? 1
                  : job.status === 'reviewed'
                    ? 3
                    : 2)
                ? 'active'
                : ''
            }
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <output>
        {job.message ||
          (job.status === 'mapping'
            ? 'Choose the layers and map their fields before building a preview.'
            : job.status === 'preview'
              ? 'Inspect the proposed changes before adding them to source review.'
              : 'Add your files, then inspect the available layers.')}
      </output>
      {job.artifacts_expired_at && (
        <p className="notice">
          Source files expired under the storage retention policy. This summary
          and all review changes are still available. Use Check source to
          download a fresh import.
        </p>
      )}
      {(job.status === 'draft' || job.status === 'failed') && (
        <div className="import-upload">
          {selectedSource?.kind === 'file' && (
            <label className="campus-file">
              <Upload /> Choose map files
              <input
                multiple
                type="file"
                accept={mapFileAccept}
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  void filesChanged(files);
                }}
              />
            </label>
          )}
          <p>
            GeoJSON · Shapefile ZIP · GeoPackage · KML/KMZ · GPX · CSV · OSM
            XML/PBF. Up to 50 MiB per batch.
          </p>
          <Button disabled={busy} onClick={() => void startPhase('inspect')}>
            <Layers /> Inspect layers
          </Button>
        </div>
      )}
      {resumable && (
        <p className="campus-notice">
          Processing in the background. You can close this workspace and resume
          from Recent imports.
        </p>
      )}
      <CampusImportMapping state={state} />
      <CampusImportSummary state={state} />
      <div className="campus-actions">
        {reviewBlocker && (
          <output id="import-review-blocker" className="small-note">
            {reviewBlocker}
          </output>
        )}
        {job.status === 'preview' && (
          <Button
            disabled={!!reviewBlocker}
            aria-describedby={
              reviewBlocker ? 'import-review-blocker' : undefined
            }
            onClick={() =>
              void run(async () => {
                try {
                  const result = await api<{ job: CampusImport }>(
                    'import-queue',
                    { importId: job.id },
                  );
                  setJob(result.job);
                } catch (error) {
                  // A lost response does not mean the transaction failed.
                  const result = await api<{ job: CampusImport }>(
                    'import-get',
                    { importId: job.id },
                  ).catch(() => null);
                  if (
                    !result ||
                    !['queued', 'running', 'reviewed'].includes(
                      result.job.status,
                    )
                  ) {
                    setUncertainReview(job.id);
                    throw error;
                  }
                  setJob(result.job);
                }
                setUncertainReview(null);
                setNotice(
                  'Preparing changes for review. You can leave this screen while the worker finishes.',
                );
                void refresh().catch(() => {});
              })
            }
          >
            <Check /> Queue for review
          </Button>
        )}
        {uncertainReview === job.id && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await api<{ job: CampusImport }>('import-get', {
                  importId: job.id,
                });
                setJob(result.job);
                setUncertainReview(null);
                setNotice(
                  result.job.status === 'reviewed'
                    ? 'Changes are queued. Review source changes before publishing.'
                    : 'The server has not queued this preview. You can retry when it is ready.',
                );
              })
            }
          >
            <RefreshCw /> Check review status
          </Button>
        )}
        {job.status === 'reviewed' && (
          <Button onClick={() => void onReview()}>
            Open source review <ChevronRight />
          </Button>
        )}
        {job.status === 'failed' && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void startPhase(job.phase === 'queue' ? 'preview' : job.phase)
            }
          >
            Retry import
          </Button>
        )}
        {!['reviewed', 'cancelled'].includes(job.status) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api('import-cancel', { importId: job.id });
                setJob({ ...job, status: 'cancelled' });
              })
            }
          >
            Cancel import
          </Button>
        )}
      </div>
    </>
  );
}
