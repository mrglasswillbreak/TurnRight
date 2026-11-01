/** Requests the normal reviewed publication operation; never performs promotion itself. */
import fs from 'node:fs/promises';
import { db } from '../web/server/backend';
import { withCampusId } from '../web/server/campus-scope';
import { workspaceAccess } from '../web/server/workspace-access';
import { publicationAction } from '../web/server/publication';
import { validModelReference } from '../web/server/model-assets';
import { proposalIds } from './model-proposal-plan.mts';
import { requestCampusPublication } from './campus-publication-request.mts';

if (process.env.CAMPUS_ID !== 'lasu' || process.argv.length !== 3)
  throw Error(
    'Use explicit LASU scope and one GitHub event JSON file argument.',
  );
const eventBytes = await fs.readFile(process.argv[2]);
if (eventBytes.length > 1024 * 1024)
  throw Error('Workflow event exceeds 1 MiB.');
const event = JSON.parse(eventBytes.toString());
await fs.mkdir('work', { recursive: true });
let lastReceipt: Record<string, unknown> = {};
const saveReceipt = async (receipt: Record<string, unknown>) => {
  lastReceipt = { ...receipt, githubRun: process.env.GITHUB_RUN_ID || null };
  await fs.writeFile(
    'work/lasu-publication-request.json',
    JSON.stringify(lastReceipt, null, 2),
  );
};
try {
  const receipt = await withCampusId('lasu', () =>
    requestCampusPublication(event.inputs, {
      db,
      access: workspaceAccess,
      publication: publicationAction,
      expectedModelIds: proposalIds,
      validReference: validModelReference,
      saveReceipt,
    }),
  );
  console.log(
    JSON.stringify({
      operation: receipt.operation,
      releaseId: receipt.releaseId || null,
      dispatchConfirmed: receipt.dispatchConfirmed,
      noRemoteWrites: receipt.noRemoteWrites,
    }),
  );
} catch (error) {
  await saveReceipt({
    ...lastReceipt,
    failed: true,
    error:
      error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Publication request failed.',
  });
  console.error(
    'Publication request failed. Inspect the private receipt and live release state before retrying.',
  );
  process.exitCode = 1;
}
