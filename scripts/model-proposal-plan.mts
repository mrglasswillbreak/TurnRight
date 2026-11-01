/** Pure guards for the LASU proposal bridge. It never replaces campus sources. */
import { createHash } from 'node:crypto';
import { evidenceHash } from './cloud.mjs';
import { validateEdit } from '../web/src/editor-edit-validation';
import { modelDocumentRevision } from '../web/src/model-document-revision';
import {
  MODEL_LIMITS,
  modelDocumentErrors,
  type ModelDocument,
  type ModelAssetReference,
} from '../web/src/model-document';
import type { CampusData, MapEdit } from '../web/src/types';
import type { GisSnapshot } from '../web/server/gis-publication';

export const proposalIds = [
  47, 44, 25, 54, 39, 31, 73, 3, 2, 55, 120, 78, 76, 75, 28, 22, 43, 103, 33,
  32,
]
  .map((id) => `arcgis:University_Property:${id}`)
  .sort();
export const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export interface Proposal {
  id: string;
  slug: string;
  document: ModelDocument;
  bytes: number;
  sha256: string;
  footprintSha256: string;
  baseline: string;
}
export interface ProposalChange {
  proposal: Proposal;
  edit: MapEdit;
  expectedUpdatedAt: string | null;
  revision: string;
}
export function checkProposals(
  proposals: Proposal[],
  expectedIds = proposalIds,
) {
  if (
    evidenceHash(proposals.map((p) => p.id).sort()) !==
    evidenceHash(expectedIds)
  )
    throw Error('Proposal inventory differs from the audited 20 buildings');
  for (const proposal of proposals) {
    if (proposal.bytes > MODEL_LIMITS.documentBytes || proposal.bytes <= 0)
      throw Error(`${proposal.slug}: editable source exceeds 25 MiB`);
    const errors = modelDocumentErrors(proposal.document);
    if (errors.length) throw Error(`${proposal.slug}: ${errors.join(' ')}`);
  }
}
export function modelChanges(
  proposals: Proposal[],
  published: CampusData,
  current: CampusData,
  drafts: MapEdit[],
): ProposalChange[] {
  return proposals.map((proposal) => {
    const original = published.map.features.find(
      (f) => f.properties?.id === proposal.id,
    );
    const effective = current.map.features.find(
      (f) => f.properties?.id === proposal.id,
    );
    const saved = drafts.find(
      (e) => e.id === proposal.id && e.kind === 'building',
    );
    if (
      !original ||
      !effective ||
      effective.properties?.kind !== 'building' ||
      saved?.deleted
    )
      throw Error(`${proposal.slug}: building missing, hidden or deleted`);
    if (
      proposal.baseline !== published.version ||
      digest(JSON.stringify(original.geometry)) !== proposal.footprintSha256
    )
      throw Error(
        `${proposal.slug}: published footprint or baseline differs from evidence`,
      );
    if (evidenceHash(original.geometry) !== evidenceHash(effective.geometry))
      throw Error(
        `${proposal.slug}: current draft moved the evidence footprint`,
      );
    // Existing draft properties are copied exactly. A new draft copies the effective feature.
    const edit: MapEdit = saved
      ? structuredClone(saved)
      : {
          id: proposal.id,
          kind: 'building',
          geometry: structuredClone(effective.geometry),
          properties: structuredClone(effective.properties || {}),
        };
    const revision = modelDocumentRevision(proposal.document);
    edit.properties.modelDocument = proposal.document;
    delete edit.properties.modelDocumentAsset;
    edit.properties.reviewedModelRevision = revision;
    const errors = validateEdit(edit);
    if (errors.length) throw Error(`${proposal.slug}: ${errors.join(' ')}`);
    return {
      proposal,
      edit,
      expectedUpdatedAt: saved?.updated_at || null,
      revision,
    };
  });
}
export function assetEdit(
  change: ProposalChange,
  reference: ModelAssetReference,
) {
  if (
    reference.sha256 !== change.proposal.sha256 ||
    reference.bytes !== change.proposal.bytes
  )
    throw Error('Immutable asset reference differs from the reviewed input');
  const edit = { ...change.edit, properties: { ...change.edit.properties } };
  delete edit.properties.modelDocument;
  edit.properties.modelDocumentAsset = reference;
  return { edit, expectedUpdatedAt: change.expectedUpdatedAt };
}
export function protectedCampusHash(campus: CampusData) {
  // Permit only the model source/reference and its explicit review mark to change.
  const clean = (properties: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(properties).filter(
        ([key]) =>
          ![
            'modelDocument',
            'modelDocumentAsset',
            'reviewedModelRevision',
          ].includes(key),
      ),
    );
  return evidenceHash({
    ...campus,
    map: {
      ...campus.map,
      // Applying an edit removes/appends that feature; compare stable identities.
      // Layer order, all other metadata, timestamps and visual revisions stay protected.
      features: campus.map.features
        .map((f) => ({
          ...f,
          properties: clean(f.properties || {}),
        }))
        .sort((a, b) =>
          `${a.properties.kind}:${a.properties.id || a.id}`.localeCompare(
            `${b.properties.kind}:${b.properties.id || b.id}`,
          ),
        ),
    },
  });
}
export function assertReadback(
  before: GisSnapshot,
  after: GisSnapshot,
  items: { edit: MapEdit }[],
) {
  const targets = new Map(
    items.map((item) => [`${item.edit.kind}:${item.edit.id}`, item.edit]),
  );
  const untouched = (snapshot: GisSnapshot) => ({
    ...snapshot,
    edits: snapshot.edits.filter((e) => !targets.has(`${e.kind}:${e.id}`)),
  });
  if (evidenceHash(untouched(before)) !== evidenceHash(untouched(after)))
    throw Error(
      'Protected workspace content changed; retain receipt and reconcile before review',
    );
  for (const [key, expected] of targets) {
    const saved = after.edits.find((e) => `${e.kind}:${e.id}` === key);
    if (
      !saved ||
      evidenceHash({
        geometry: saved.geometry,
        properties: saved.properties,
        deleted: !!saved.deleted,
      }) !==
        evidenceHash({
          geometry: expected.geometry,
          properties: expected.properties,
          deleted: !!expected.deleted,
        })
    )
      throw Error(`Model batch readback differs: ${key}`);
  }
}
export function requireApplyGuards(
  actualWorkspace: string,
  actualPlan: string,
  expectedWorkspace?: string,
  expectedPlan?: string,
  ownerOverride = false,
  reason = '',
) {
  if (!expectedWorkspace || actualWorkspace !== expectedWorkspace)
    throw Error(
      'Reviewed complete workspace hash required; prepare again after any change',
    );
  if (!expectedPlan || actualPlan !== expectedPlan)
    throw Error(
      'Reviewed model plan hash required; inputs or decision changed',
    );
  if (ownerOverride && (reason.trim().length < 5 || reason.length > 1000))
    throw Error(
      'Original-owner override requires an explicit reason of 5–1000 characters',
    );
}
