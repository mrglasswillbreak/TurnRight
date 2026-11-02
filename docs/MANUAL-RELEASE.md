# One-off manual LASU release

This operator path supports the authorized LASU release while GitHub Actions cannot start. Normal Actions scheduling remains the default. The 20 model documents are already saved and reconciled: **never repeat the model apply**. A draft PR or software release is not a campus publication receipt.

## Local validation

Use an isolated, full-history Linux checkout with the pinned Node/npm versions, Python 3.12, Docker and gitleaks 8.30.1. Keep private receipts outside the source checkout. The validator rejects cloud credentials, test filters, stale coverage, synthetic service state and frozen release markers.

    npm run release:manual:validate -- --expected-commit FULL_COMMIT_SHA --output /absolute/new/private/validation

The fixed gates cover quality, application coverage, Chromium/WebKit, offline behavior, native database restoration, GIS/import workers, the complete local stack, security and the production build. Coverage retains the 80% statements/lines/functions and 70% branches floors. Each receipt binds the commit, tree, tracked-source and dependency hashes, coverage snapshot, gate policy, commands, results and log hashes. Failed or interrupted evidence cannot authorize publication.

Unit tests run before browser-component tests, and the complete coverage gate has a 90-minute outer limit. Embedded database setup has a shared 180-second allowance for WebAssembly startup and migration loading under coverage. The full-size compaction case allows 15 seconds; hydrated-publication and 100,000-feature archive cases allow 30 seconds each. All fixture sizes and assertions still run, with the existing SQL deadlines and coverage thresholds. Partial diagnostic runs cannot replace the complete validation receipt.

The committed-fixture build is followed by a separate real-public-package preservation check before deployment. Do not substitute previous hosted results or partially downloaded artifacts for complete current validation.

## Explicit operator commands

Every operation uses its own immutable private request and the SHA256 of its exact bytes:

    npm run release:manual -- inspect --request /absolute/private/request.json --request-sha256 RAW_FILE_SHA256

The operations are inspect, resume-review, preview, verify, publish and audit. The [request validator](../scripts/manual-release-request.mjs) defines the exact contract. Requests pin LASU, the expected main revision, a local run UUID, an external journal directory, validation evidence, original apply/reconciliation records and exclusive-publication evidence. Later operations additionally pin the approved review, release, version, deployment and successful comparison.

TURNRIGHT_LOCAL_RUN_ID identifies the actual local execution and its temporary credentials. It does not impersonate an Actions run. Provenance checks remote main and the actual local source. A validated PR head may authorize its merge commit only when ancestry and the complete tree, source, dependencies and coverage snapshot agree.

Intent is written before mutation. An uncertain outcome retains its lock and requires inspection before resuming; never regenerate operation identities or blindly replay writes. Review continuation uses the existing review API and recorded original-owner decision. It cannot upload or save the model batch again.

The exclusive Linux lock is stored at `/var/tmp/turnright-manual-release-locks/<project-key>.lock`, where the key is SHA256 of `vercel-project`, a NUL separator and the exact `VERCEL_PROJECT_ID`. This private host directory is fixed: changing the journal directory, checkout, HOME or local run UUID cannot bypass a retained lock. The lock contains the project ID, run UUID, request hash, operation and canonical journal directory, never credentials. Different projects use separate locks.

`inspect` and `audit` remain read-only and do not acquire, clear or require access to the exclusive lock. To recover a retained lock, first stop the original process and inspect its hash-chained journal and current remote state. Confirm the exact run's temporary preview access is revoked and no conflicting job, deployment or uncertain mutation remains. Preserve the lock's exact bytes and SHA256 with the inspection evidence. Only then may the operator remove that exact project lock and authorize a separately reviewed continuation; an audit never unlocks automatically, and a new journal is not a recovery mechanism.

## Credentials and exclusive window

Use authenticated access to the existing GitHub/Vercel projects and securely inject SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID. Keep secrets out of Git, requests, command arguments, logs and receipts. Validation processes receive no production credentials.

Before mutation, save the normal release workflow's state, temporarily disable that workflow and verify no competing release job or Vercel deployment is active. Every operation requires fresh, hash-pinned exclusivity evidence and rechecks live jobs/deployments. Keep the local operation lock throughout and restore the workflow's prior state after completion or inspected failure. Interrupted restoration remains explicitly unfinished work.

Temporary preview access is scoped to the recorded local UUID and revoked in outer cleanup, including uncertain creation acknowledgements. Local execution never prints a masking command containing a secret. Cleanup targets only that exact run identity.

## Temporary merge exception

The original owner authorized a temporary exception for this campaign's validated PR and final documentation follow-up. It does not replace normal repository policy.

1. Save the current protection settings and verify the exact PR head/base and complete local validation receipt. Retain the required-check definitions.
2. Temporarily remove administrator enforcement, merge only the verified revision using the owner account, and immediately restore the prior enforcement state on success or failure.
3. Read back all protection settings and compare them with the saved configuration. Do not deploy while restoration is unconfirmed. Unexpected branch or settings changes require reconciliation.
4. Record the exception and local acceptance in PR/release evidence. Never label local results as successful Actions checks. Campaign commits use the GitHub skip-ci marker to avoid hosted push/PR runs; future work retains normal policy.

## Preview, publish and finish

Verify the compatible merged reader and preservation of the existing campus catalogue, manifests and assets. Resume review from the pinned saved-model records, request the exact reviewed preview and run the existing release worker locally.

Full preview verification visits all 20 models in Chromium and WebKit, includes every detail level and texture offline, and retains photographs and historical restoration assets. Frozen controls and comparator bytes remain immutable. Local comparisons receive distinct local receipts, not fabricated hosted artifact identities.

Publish only the verified preview through the existing approval, lease, catalogue and promotion guards. Confirm the completion audit, published database state, exact deployment/catalogue, every asset hash and unchanged UNILAG. Run production offline verification and capture actual production screenshots before updating documentation or publishing the GitHub release.

Local checks do not establish physical-phone performance or independent architectural approval. Retain estimated dimensions and unseen elevations, three identification holds and four additional footprint gaps. Keep private logs, reference photographs and comparison sheets outside public assets.

[Normal deployment policy](DEPLOYMENT.md) · [Model publication](MODEL-CAMPAIGN-PUBLICATION.md) · [Production evidence](PRODUCTION.md)
