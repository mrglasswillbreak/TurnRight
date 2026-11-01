/** Download only an explicitly pinned asset from this repository and verify all ZIP entries. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  digest,
  checkProposals,
  type Proposal,
} from './model-proposal-plan.mts';
import type { ModelDocument } from '../web/src/model-document';

interface ArchiveManifest {
  version: number;
  baseline: string;
  models: { buildingId: string; slug: string }[];
  files: { file: string; sha256: string; bytes: number }[];
}
interface Rights {
  models: {
    buildingId: string;
    slug: string;
    proceduralMaterialImages: string[];
    photographicDerivatives: {
      photoId: string;
      auditStatus: string;
      author: string;
      license: string;
      sourceUrl: string;
      licenseUrl: string;
    }[];
  }[];
}
export async function downloadProposalInputs() {
  const assetId = process.env.MODEL_RELEASE_ASSET_ID || '';
  const sha256 = process.env.MODEL_ARCHIVE_SHA256 || '';
  const repository = process.env.GITHUB_REPOSITORY || '';
  if (
    !/^\d+$/.test(assetId) ||
    !/^[a-f\d]{64}$/.test(sha256) ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !process.env.GH_TOKEN
  )
    throw Error(
      'Pinned repository release asset ID, SHA256 and workflow token are required',
    );
  await fs.mkdir('work', { recursive: true });
  const archive = path.resolve('work/model-proposals.zip');
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/assets/${assetId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/octet-stream',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(180000),
    },
  );
  if (!response.ok || !response.body) {
    const requestId = response.headers.get('x-github-request-id') || '';
    const safeRequestId = /^[a-z\d:-]{1,128}$/i.test(requestId)
      ? requestId
      : 'unavailable';
    throw Error(
      `Pinned release asset cannot be downloaded (HTTP ${response.status}; GitHub request ID ${safeRequestId}).`,
    );
  }
  const output = await fs.open(archive, 'wx');
  let bytes = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      bytes += chunk.length;
      if (bytes > 512 * 1024 * 1024)
        throw Error('Proposal ZIP exceeds 512 MiB');
      await output.write(chunk);
    }
  } finally {
    await output.close();
  }
  const directory = path.resolve('work/model-proposals');
  const extractor = fileURLToPath(
    new URL('./model-proposal-archive.py', import.meta.url),
  );
  await promisify(execFile)(
    'python3',
    [extractor, archive, directory, sha256],
    {
      timeout: 180000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  return { directory, assetId, sha256, repository, bytes };
}
export async function loadProposalInputs(directory: string) {
  const read = async <T,>(relative: string): Promise<T> =>
    JSON.parse(await fs.readFile(path.join(directory, relative), 'utf8'));
  const manifest = await read<ArchiveManifest>('EXPORT-MANIFEST.json');
  const rights = await read<Rights>('ASSET-RIGHTS.json');
  const proposals: Proposal[] = [];
  for (const model of manifest.models) {
    const relative = `${model.slug}/turnright.model.json`;
    const file = manifest.files.find((item) => item.file === relative);
    const bytes = await fs.readFile(path.join(directory, relative));
    if (!file || digest(bytes) !== file.sha256 || bytes.length !== file.bytes)
      throw Error('Extracted model differs from pinned manifest');
    const document = JSON.parse(bytes.toString()) as ModelDocument;
    const evidence = await read<{
      campus: string;
      buildingId: string;
      baseline: { release: string; footprintSha256: string };
    }>(`${model.slug}/evidence.json`);
    if (
      evidence.campus !== 'lasu' ||
      evidence.buildingId !== model.buildingId ||
      evidence.baseline.release !== manifest.baseline
    )
      throw Error('Proposal identity or baseline is inconsistent');
    const credit = rights.models.find(
      (item) =>
        item.buildingId === model.buildingId && item.slug === model.slug,
    );
    if (!credit) throw Error('Proposal embedded-image rights record is absent');
    for (const image of document.images) {
      const imageHash = digest(Buffer.from(image.data, 'base64'));
      if (
        !image.evidence &&
        credit.proceduralMaterialImages.includes(imageHash)
      )
        continue;
      const photo = credit.photographicDerivatives.find(
        (item) => item.photoId === image.evidence?.photoId,
      );
      const permittedPhoto = new Map([
        ['arcgis:University_Property:120', 'commons:138069484'],
        ['arcgis:University_Property:3', 'commons:198256532'],
      ]).get(model.buildingId);
      if (
        !photo ||
        photo.photoId !== permittedPhoto ||
        photo.auditStatus !== 'reuse-verified' ||
        photo.license !== 'CC BY-SA 4.0' ||
        !photo.author ||
        !photo.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/') ||
        !photo.licenseUrl.startsWith(
          'https://creativecommons.org/licenses/by-sa/4.0',
        )
      )
        throw Error('Model embeds an image without audited reuse rights');
    }
    proposals.push({
      id: model.buildingId,
      slug: model.slug,
      document,
      bytes: bytes.length,
      sha256: file.sha256,
      footprintSha256: evidence.baseline.footprintSha256,
      baseline: manifest.baseline,
    });
  }
  checkProposals(proposals);
  return { proposals, manifest };
}
