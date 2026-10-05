import { db, dispatch, HttpError } from './backend.js';
import { currentCampusId } from './campus-scope.js';
import { processingErrors, validUuid } from '../src/gis-contracts.js';
import type { ProcessingRequest, ProcessingJob } from '../src/gis-types.js';
const fields =
  'id,actor,tool,request,input_revision,status,progress,message,engine,artifact,output_dataset_id,created_at';
export async function processingAction(
  actor: string,
  action: string,
  input: Record<string, unknown>,
) {
  if (action === 'gis-jobs')
    return db('gis_jobs?select=' + fields + '&order=created_at.desc&limit=50');
  if (action === 'gis-job-start') {
    const errors = processingErrors(input as unknown as ProcessingRequest);
    if (errors.length) throw new HttpError(400, errors.join(' '));
    const job = await db<ProcessingJob>('rpc/gis_start_job', 'POST', {
      actor,
      job_request: input,
    });
    if (job.status === 'queued') {
      try {
        await dispatch('gis-processing.yml', {
          campus_id: currentCampusId(),
          job_id: job.id,
        });
      } catch (error) {
        await db('gis_jobs?id=eq.' + job.id + '&status=eq.queued', 'PATCH', {
          status: 'failed',
          message: (error as Error).message,
          completed_at: new Date().toISOString(),
        });
        throw error;
      }
    }
    return job;
  }
  if (!validUuid(input.id))
    throw new HttpError(400, 'Choose a processing job.');
  if (action === 'gis-job-preview') {
    const [job] = await db<{ run_token: string; status: string }[]>(
      'gis_jobs?id=eq.' + input.id + '&select=run_token,status',
    );
    if (!job || !['succeeded', 'applied'].includes(job.status))
      throw new HttpError(409, 'Output is not ready.');
    const rows = await db<{ feature: unknown }[]>(
      'gis_job_features?job_id=eq.' +
        input.id +
        '&run_token=eq.' +
        job.run_token +
        '&select=feature&order=id&limit=100',
    );
    return rows.map((r) => r.feature);
  }
  if (action === 'gis-job-cancel')
    return {
      ok: await db('rpc/gis_cancel_job', 'POST', {
        actor,
        job_identity: input.id,
      }),
    };
  if (action === 'gis-job-apply')
    return db('rpc/gis_apply_job', 'POST', { actor, job_identity: input.id });
  if (action === 'gis-job-artifact') {
    const [job] = await db<{ artifact?: { path: string }; status: string }[]>(
      'gis_jobs?id=eq.' + input.id + '&select=artifact,status',
    );
    if (!job?.artifact?.path || !['succeeded', 'applied'].includes(job.status))
      throw new HttpError(404, 'Export is not ready.');
    const signed = await fetch(
      process.env.SUPABASE_URL +
        '/storage/v1/object/sign/gis-private/' +
        job.artifact.path,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!signed.ok) throw new HttpError(503, 'Export storage is unavailable.');
    const result = await signed.json();
    return { url: process.env.SUPABASE_URL + '/storage/v1' + result.signedURL };
  }
  throw new HttpError(400, 'Unknown processing action.');
}
