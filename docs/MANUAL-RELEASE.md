# One-off manual LASU release

This operator path supports the authorized LASU release while GitHub Actions cannot start. Normal Actions scheduling remains the default. The 20 model documents are already saved and reconciled: **never repeat the model apply**. A draft PR or software release is not a campus publication receipt.

## Local validation

Use an isolated, full-history Linux checkout with the pinned Node/npm versions, Python 3.12, Docker and gitleaks 8.30.1. Run as an ordinary Linux user with Docker access and a user-owned checkout, private HOME and receipt directory; real and effective root UIDs are rejected before validation creates output. This preserves the native workers' bind-mount ownership and cleanup checks. Keep private receipts outside the source checkout. The validator rejects cloud credentials, test filters, stale coverage, synthetic service state and frozen release markers.

Provision Chromium and WebKit system libraries with administrator access before validation, using `npm exec -- playwright install-deps chromium webkit` from a checkout installed with the pinned lockfile. The recorded setup gate installs the matching browser binaries without elevating privileges, then launches and closes both browsers to detect missing libraries before the test suites. All 24 gates and coverage thresholds remain required.

    npm run release:manual:validate -- --expected-commit FULL_COMMIT_SHA --output /absolute/new/private/validation

The fixed gates cover quality, application coverage, Chromium/WebKit, offline behavior, native database restoration, GIS/import workers, the complete local stack, security and the production build. Coverage retains the 80% statements/lines/functions and 70% branches floors. Each receipt binds the commit, tree, tracked-source and dependency hashes, coverage snapshot, gate policy, commands, results and log hashes. Failed or interrupted evidence cannot authorize publication.

Unit tests run before browser-component tests, and the complete coverage gate has a 90-minute outer limit. Embedded database setup has a shared 180-second allowance for WebAssembly startup and migration loading under coverage. The full-size compaction case allows 15 seconds; hydrated-publication and 100,000-feature archive cases allow 30 seconds each. All fixture sizes and assertions still run, with the existing SQL deadlines and coverage thresholds. Partial diagnostic runs cannot replace the complete validation receipt.

Arrival browser journeys wait up to 30 seconds for the lazy Place actions group after each full navigation, including the initial load and offline cold reload, then retain the ordinary image, entrance and route assertions. In one recorded offline failure, a later DOM snapshot contained the action group and first photograph 11.543 seconds after the initial image assertion began. This records snapshot timing, not the exact mount time or a hardware cause. Offline arrival keeps its image decoding, credits, service-worker control and download assertions and its 90-second whole-test limit. The campus-load error journey waits up to 30 seconds for its mocked 503 response before checking the error UI. The responsive editor import journey and the independent public campus chooser/Offline capture flow run as separate tests with the same photograph fixture. The editor journey keeps its 180-second whole-test limit under Chromium coverage and 120 seconds otherwise; its seven viewports, two zoom levels and assertions are unchanged. The public flow uses the ordinary test budget at 1440 × 900. Both tests retain the original capture names and environment gates. Public chooser layout checks run separately for each of the five original viewport sizes, retaining live resizing and both collapsed and expanded states. Global assertion timeouts remain unchanged.

Campus preference journeys separately verify non-default restoration, explicit LASU override and recovery from an unavailable campus. Each establishes its previous preference through a real successful public load in its own browser context. The lazy campus chooser has a bounded 30-second readiness check after restoration or recovery; URL, preference and error assertions retain their existing deadlines, as do the whole-test limits.

The offline roof recovery journey allows 180 seconds for preparation, unfinished-input recovery, offline repair and a second cold reload. In one recorded 120-second failure, service-worker readiness consumed 22.845 seconds and teardown began during eaves-input confirmation. The later reload activity was already under teardown and does not establish an offline bootstrap failure. The two chronological offline reloads, UI and persistence assertions, and helper limits are unchanged.

The shared editor fixture waits up to 30 seconds for the Draw path control to become enabled while map initialization completes. Explicit startup timeout overrides are preserved. This readiness check runs before feature interactions; their assertion deadlines and whole-test limits remain unchanged.

The unified model fixture waits up to 30 seconds for its lazy model-editor dialog to become visible. A recorded failure still had preview-worker dependencies loading at the former 10-second deadline, while the later failure snapshot contained the model editor. Subsequent controls and functional assertions retain their ordinary deadlines.

The shared model-focus helper waits up to 30 seconds for enhanced models to replace their base extrusions. In one recorded coverage run, the unchanged Senate filter predicate completed successfully at 11.296 seconds, after its previous 10-second deadline. The filter predicate, subsequent picking/drawing/fallback assertions and whole-test limits remain unchanged; this timing does not establish a hardware cause or performance result.

Slate-map scale checks run separately for each renderer, retaining all three zoom levels and their original screenshot names. A separate continuity journey exercises enhanced, simple and 2D transitions before checking light/dark paints and camera preservation at the original final view. Every case retains canvas, control, edit and error checks, with the existing 210-second whole-test limit. Camera-change `map.loaded()` polls allow 30 seconds; theme assertions retain their ordinary deadlines. A recorded combined journey completed its nine screenshots only after exhausting its whole-test budget, and its pending light-paint query later returned the expected colour. These observations are separate from complete validation and make no hardware or frame-rate claim.

Photographic projection/cancellation and model export run as separate journeys, each creating and texturing its mesh through the real UI. The export journey retains undo/redo before GLB and PNG generation so restored image resources are exercised. It waits up to 30 seconds for its prepared GLB download link. In a recorded failure, the exporter's lazy dependencies finished 7.776 seconds into the previous 10-second wait, and the later failure snapshot contained the completed download. All source-evidence, UV, undo/redo and PNG-render assertions remain, with the 180-second limit for each journey and the existing 60-second PNG preparation allowance.

Precision mouse and touch journeys use scoped Playwright context options and the runner's page fixture. Coverage collection and context closure run in fixture teardown, separate from the geometry test body. Viewports, gesture types, geometry checks, undo/redo and reload recovery are unchanged; this lifecycle change does not establish the cause of an earlier timeout.

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
