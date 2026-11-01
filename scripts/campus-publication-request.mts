/** Guarded LASU request bridge. Only publicationAction may request remote writes. */
type Reference = { id: string; version: 1; sha256: string; bytes: number };
type Snapshot = {
  edits: {
    id: string;
    kind: string;
    deleted?: boolean;
    properties: {
      modelDocumentAsset?: Reference;
      reviewedModelRevision?: string;
    };
  }[];
};
type Review = {
  id: string;
  campus_id: string;
  status: string;
  content_hash: string;
  snapshot: Snapshot;
};
type Release = {
  id: string;
  campus_id: string;
  review_id: string;
  status: string;
  version?: string;
  deployment_id?: string;
  preview_url?: string;
  deployment_url?: string;
  catalogue_revision: string;
  snapshot: Snapshot;
};
interface Dependencies {
  db: (route: string, method?: string, body?: unknown) => Promise<unknown>;
  access: (
    actor: string,
    action: string,
  ) => Promise<{
    userId: string;
    campusId: string;
    capabilities: string[];
  }>;
  publication: (
    actor: string,
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  expectedModelIds: readonly string[];
  validReference: (reference: Reference) => boolean;
  saveReceipt: (receipt: Record<string, unknown>) => Promise<void>;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = [
  'operation',
  'review_id',
  'expected_review_hash',
  'release_id',
  'expected_version',
  'expected_deployment_id',
  'summary',
];

export function publicationRequest(input: unknown) {
  if (!record(input) || Object.keys(input).some((key) => !keys.includes(key)))
    throw Error('Use only the documented publication inputs.');
  const values = Object.fromEntries(keys.map((key) => [key, input[key] ?? '']));
  if (Object.values(values).some((value) => typeof value !== 'string'))
    throw Error('Publication inputs must be strings.');
  const request = values as Record<(typeof keys)[number], string>;
  if (
    !['inspect', 'prepare', 'publish'].includes(request.operation) ||
    !uuid(request.review_id) ||
    !hash(request.expected_review_hash)
  )
    throw Error(
      'An explicit operation, approved review UUID and receipt content hash are required.',
    );
  if (request.release_id && !uuid(request.release_id))
    throw Error('Invalid release identity.');
  if (request.operation === 'prepare') {
    if (
      request.release_id ||
      request.expected_version ||
      request.expected_deployment_id ||
      request.summary.trim().length < 5 ||
      request.summary.length > 500
    )
      throw Error(
        'Prepare requires a 5–500 character summary and no previous release identity.',
      );
  } else if (request.summary)
    throw Error('Only prepare accepts a release summary.');
  if (
    request.operation === 'publish' &&
    (!uuid(request.release_id) ||
      !/^lasu-[a-f\d]{12}$/.test(request.expected_version) ||
      !/^dpl_[A-Za-z\d]{1,100}$/.test(request.expected_deployment_id))
  )
    throw Error(
      'Publish requires the exact preview release UUID, LASU version and canonical deployment ID.',
    );
  if (
    request.operation === 'inspect' &&
    (request.expected_version || request.expected_deployment_id)
  )
    throw Error(
      'Inspect reports the actual release version and deployment without requesting publication.',
    );
  return request;
}

function models(snapshot: Snapshot, dependencies: Dependencies) {
  const ids = dependencies.expectedModelIds;
  if (
    ids.length !== 20 ||
    new Set(ids).size !== 20 ||
    !Array.isArray(snapshot?.edits)
  )
    throw Error(
      'The audited LASU model inventory must contain exactly 20 unique identities.',
    );
  return [...ids].sort().map((id) => {
    const matches = snapshot.edits.filter(
      (edit) => edit.kind === 'building' && edit.id === id,
    );
    const edit = matches[0],
      reference = edit?.properties?.modelDocumentAsset;
    if (
      matches.length !== 1 ||
      edit.deleted ||
      !reference ||
      !dependencies.validReference(reference) ||
      typeof edit.properties.reviewedModelRevision !== 'string' ||
      !edit.properties.reviewedModelRevision.startsWith('model1-') ||
      edit.properties.reviewedModelRevision.length > 80
    )
      throw Error(
        'An audited model is missing, duplicated, deleted or lacks its immutable reviewed source.',
      );
    return {
      id,
      asset: {
        id: reference.id,
        version: reference.version,
        sha256: reference.sha256,
        bytes: reference.bytes,
      },
      reviewedModelRevision: edit.properties.reviewedModelRevision,
    };
  });
}

export async function requestCampusPublication(
  input: unknown,
  dependencies: Dependencies,
) {
  const request = publicationRequest(input);
  const { db, access, publication, saveReceipt } = dependencies;
  const read = async <T,>(route: string, method?: string, body?: unknown) =>
    (await db(route, method, body)) as T;
  const owners = await read<{ id: string }[]>('admin_users?select=id&limit=2');
  if (owners.length !== 1 || !uuid(owners[0].id))
    throw Error('An unambiguous existing original owner identity is required.');
  const owner = owners[0].id;
  const action =
    request.operation === 'inspect' ? 'state' : request.operation + '-release';
  const capabilities = await access(owner, action);
  if (
    capabilities.userId !== owner ||
    capabilities.campusId !== 'lasu' ||
    !capabilities.capabilities.includes(
      request.operation === 'inspect' ? 'read' : 'publish',
    )
  )
    throw Error(
      'The original owner lacks the required LASU campus capability.',
    );
  const [review] = await read<Review[]>(
    `gis_reviews?id=eq.${request.review_id}&select=id,campus_id,status,content_hash,snapshot`,
  );
  if (!review || review.id !== request.review_id || review.campus_id !== 'lasu')
    throw Error('The requested LASU review does not exist.');
  const workspaceHash = await read<string>(
    'rpc/gis_workspace_content_hash',
    'POST',
    {},
  );
  const [release] = request.release_id
    ? await read<Release[]>(
        `releases?id=eq.${request.release_id}&select=id,campus_id,review_id,status,version,deployment_id,preview_url,deployment_url,catalogue_revision,snapshot`,
      )
    : [];
  if (
    request.release_id &&
    (!release ||
      release.id !== request.release_id ||
      release.campus_id !== 'lasu')
  )
    throw Error('The requested LASU release does not exist.');
  const receipt: Record<string, unknown> = {
    operation: request.operation,
    campus: 'lasu',
    owner,
    reviewId: review.id,
    expectedReviewHash: request.expected_review_hash,
    reviewHash: review.content_hash,
    reviewStatus: review.status,
    workspaceHash,
    matchesReceipt: review.content_hash === request.expected_review_hash,
    workspaceCurrent: workspaceHash === request.expected_review_hash,
    ...(release
      ? {
          release: {
            id: release.id,
            reviewId: release.review_id,
            status: release.status,
            version: release.version,
            deploymentId: release.deployment_id,
            previewUrl: release.preview_url,
            deploymentUrl: release.deployment_url,
            catalogueRevision: release.catalogue_revision,
          },
        }
      : {}),
    dispatchConfirmed: false,
    noRemoteWrites: true,
  };
  await saveReceipt(receipt);
  if (request.operation === 'inspect') return receipt;
  if (
    review.status !== 'approved' ||
    review.content_hash !== request.expected_review_hash ||
    workspaceHash !== request.expected_review_hash
  )
    throw Error(
      'The exact approved review and current workspace must match the successful model apply receipt.',
    );
  const targetModels = models(review.snapshot, dependencies);
  if (request.operation === 'publish') {
    if (
      !release ||
      release.review_id !== review.id ||
      release.status !== 'preview' ||
      release.version !== request.expected_version ||
      release.deployment_id !== request.expected_deployment_id
    )
      throw Error(
        'The release must match the exact approved review and ready preview version/deployment.',
      );
    if (
      JSON.stringify(models(release.snapshot, dependencies)) !==
      JSON.stringify(targetModels)
    )
      throw Error(
        'The release model references differ from the pinned approved review.',
      );
  }
  if (
    (await read<string>('rpc/gis_workspace_content_hash', 'POST', {})) !==
    request.expected_review_hash
  )
    throw Error('The workspace changed while checking publication guards.');
  Object.assign(receipt, {
    models: targetModels,
    guardsPassed: true,
    noRemoteWrites: false,
    requestMayHaveStarted: true,
  });
  await saveReceipt(receipt);
  // Existing API performs snapshot hydration/validation, SQL approval guards,
  // catalogue checks, audit recording and main-branch workflow dispatch.
  const result = await publication(
    owner,
    action,
    request.operation === 'prepare'
      ? { reviewId: review.id, summary: request.summary.trim() }
      : { id: release!.id },
  );
  if (
    !record(result) ||
    !uuid(result.id) ||
    (release && result.id !== release.id)
  )
    throw Error(
      'Publication request returned an unexpected identity; inspect before retrying.',
    );
  Object.assign(receipt, { releaseId: result.id, dispatchConfirmed: true });
  await saveReceipt(receipt);
  return receipt;
}
