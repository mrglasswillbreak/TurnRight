/** All private writes use the existing immutable asset validation and a verified rollback copy. */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { evidenceHash } from './cloud.mjs';
import { modelAssetAction } from '../web/server/model-assets';
import type { ModelAssetReference } from '../web/src/model-document';
import type { GisSnapshot } from '../web/server/gis-publication';
import type { Proposal } from './model-proposal-plan.mts';

export async function backupWorkspace(
  snapshot: GisSnapshot,
  workspaceHash: string,
  planHash: string,
) {
  const storagePath = `lasu/${randomUUID()}/model-proposals-before.json`;
  const body = JSON.stringify({ snapshot, workspaceHash, planHash });
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${storagePath}`;
  const stored = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (!stored.ok) throw Error('Private rollback backup could not be stored');
  const readback = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(60000),
  });
  if (
    !readback.ok ||
    evidenceHash(await readback.json()) !== evidenceHash(JSON.parse(body))
  )
    throw Error('Private rollback backup failed readback verification');
  return { storagePath, sha256: evidenceHash(JSON.parse(body)) };
}
export async function uploadProposal(
  owner: string,
  proposal: Proposal,
  directory: string,
) {
  const result = (await modelAssetAction(owner, 'model-asset-begin', {
    sha256: proposal.sha256,
    bytes: proposal.bytes,
  })) as { ready: boolean; reference: ModelAssetReference; url?: string };
  if (!result.ready) {
    if (!result.url) throw Error('Model upload URL missing');
    const upload = await fetch(result.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
      body: await fs.readFile(
        path.join(directory, proposal.slug, 'turnright.model.json'),
      ),
      signal: AbortSignal.timeout(60000),
    });
    // A retry may encounter an already uploaded pending object. Confirm reads and hashes it.
    if (!upload.ok && upload.status !== 409)
      throw Error('Private model upload failed');
  }
  await modelAssetAction(owner, 'model-asset-confirm', {
    reference: result.reference,
  });
  return result.reference;
}
