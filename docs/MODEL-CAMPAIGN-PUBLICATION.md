# Publishing the LASU Ojo model proposals

The proposal archive is an import source. It is not a campus replacement and its
existence does not imply architectural approval. The bridge currently accepts the
20 audited Ojo building IDs, preserving the published 614-building baseline,
existing private corrections, photographs, routing and other campuses.

The [one-off manual LASU release path](MANUAL-RELEASE.md) continues the already saved and reconciled batch when Actions cannot start. It does not repeat the import or imply publication.

The [versioned release evidence index](PRODUCTION.md#lasu-detailed-model-release-evidence) identifies the actual review, package, preservation and offline-verification records. Its production capture bundle is separate from the dated proposal renders. Keep the original proposal archive and receipt unchanged; later completion evidence binds their exact source hashes to the published package.

Use **Prepare reviewed campus layer release** (`campus-layer-release.yml`) with
`campus_id=lasu` and `upgrade=models` on the reviewed reader/worker commit.

1. Run `operation=inspect`. This requires no proposal asset. The private Actions
   artifact contains `lasu-model-inspection.json`: actual original-owner identity,
   effective capabilities, complete workspace hash, current publication, private
   model storage usage, existing authored drafts, reviews and pending releases.
   It performs no remote writes. Reconcile any conflicting private draft before
   continuing; the published package alone does not establish draft state.
2. Attach the verified portable ZIP to a GitHub draft release in this repository.
   Record its immutable numeric release asset ID and SHA256. Observation-only
   reference photographs and private comparison sheets stay outside this ZIP.
   Regenerate the archive and its manifest after changing any editable source.
3. Run `operation=prepare` with `model_asset_id` and `model_archive_sha256`.
   Every ZIP entry is streamed through its size/hash check, unsafe paths are
   rejected, and only model JSON, evidence and rights inputs are extracted.
   Preparation validates all 20 documents through the actual publication path,
   current footprint alignment, reviewed revisions, embedded-image permissions,
   the full pinned public manifest and its 43 photo assets, other-campus catalogue identities,
   the 25 MiB per-document limit and 500 MiB owner storage budget. Inspect the
   private `lasu-model-receipt.json`, including every changed building/model hash.
4. Run `operation=apply` with the same pinned input and the receipt's
   `expectedHash` as `expected_hash`, plus `planHash` as `expected_model_plan`.
   The helper first stores and verifies a private rollback snapshot, then uses
   the normal begin/upload/confirm asset validation. One atomic model edit batch
   uses each existing edit's `expectedUpdatedAt`. It changes only model asset
   references and exact model review revisions. Source records are never replaced.
   Dataset membership is checked before writes and again before the atomic save.
   Readback permits only the exact dataset revision increments produced by those
   building edits; dataset fields, other edits and the rest of the snapshot stay
   protected. The accepted workspace hash is saved before readback validation.
   Readback must preserve all unrelated workspace content before submission.
5. By default, apply creates an unapproved GIS review. An eligible independent
   reviewer approves through the normal editor. If the actual original owner
   explicitly authorizes their own decision, set `model_owner_override=true` and
   a concrete `model_override_reason` during **both prepare and apply**. The
   decision is bound into `planHash`, validated through `reviewAction`, and audited
   by `gis_decide_review` as `review-owner-override`. Administrator membership
   alone is insufficient. Do not claim independent approval in this reason.
6. Prepare the release from the resulting approved review through the normal
   publication interface. Verify the frozen deployment's 20 model variants,
   textures, offline download and unchanged LASU/UNILAG catalogue entries. Then
   publish that exact preview through the normal publication action. This helper
   never prepares a public release, promotes a deployment or bypasses CI gates.

When the signed-in editor is unavailable, **Request reviewed LASU model
publication** (`campus-publication-request.yml`) invokes the same publication
action from `main`. Use `review_id` and `expected_review_hash` from the successful
apply receipt, never a newly derived workspace hash. `operation=prepare` also
requires a 5–500 character `summary`; `operation=inspect` performs no remote
writes and optionally accepts `release_id` to report progress. The wrapper reads
the actual original owner, checks current LASU capabilities, the approved hash,
the complete workspace hash and all 20 immutable reviewed model references.
Verify the resulting preview with `campus-detail-verification.yml`, using its
release ID, `campus_id=lasu`, `scope=all` and no application deployment input.
For this 20-model campaign, also pass `expected_model_ids` as a JSON array of
building IDs from the successful apply receipt's `changes`, not from the candidate
package being checked. The verifier requires that exact set, then reopens and
performs renderer hit tests on every detailed model offline in Chromium and
WebKit, saving screenshots and the verification report. Omitting this input is
only appropriate for compatible-reader or legacy-package checks.

After accepting that report, request `operation=publish` with the same review
and release IDs/hash, plus its exact `expected_version` and canonical
`expected_deployment_id`. The release must still be that ready preview with the
same model references. Normal catalogue, approval, CI and publication guards
remain in force. Inspect the private `lasu-publication-request` artifact after
each request; an uncertain dispatch must be inspected before retrying. A
confirmed dispatch is not a completed publication. The job uses the existing
Supabase secrets and a step-scoped GitHub token with job-level `actions: write`;
workflow inputs arrive through the event-file CLI argument, with no new secret
or application environment setting.

If a batch was saved but its review was not completed, retain the original apply
receipt and do not replay `apply`. Run `operation=inspect`, `upgrade=models` with
`reconciliation_pin` containing `apply_run_id`, `apply_artifact_id` and
`receipt_sha256`. These identify the original private Actions artifact and exact
raw receipt bytes. This routes exclusively to the read-only diagnostic. It
verifies the backup, operation results, every stored model, dataset counters,
publication projection and stable workspace hash. Only the sanitized diagnostic
receipt is uploaded; full private snapshots remain in memory.

After accepting a complete, successful diagnostic, `operation=resume-review`
runs only from `main`. Its `reconciliation_pin` retains those three fields and
adds `reconciliation_run_id`, `reconciliation_artifact_id`,
`reconciliation_sha256`, `expected_workspace_hash` and `review_operation_id`.
Copy the hash from the verified diagnostic and choose one new review UUID before
dispatch. The continuation rechecks the pinned sources, operation, original
owner, capabilities, public baseline and current workspace. It only submits and
records the previously authorized original-owner decision through the existing
review API; it never saves models or requests publication. Intent receipts are
saved before each mutation. If the review UUID already exists or a response is
uncertain, inspect that exact review before continuing.

Use the successful continuation receipt's `review.id` and `review.contentHash`
for the normal publication request. Keep the original failed apply receipt and
the later continuation receipt as separate records. The [November 1 saved-model
reconciliation](../data/lasu-models/import-reconciliation-2026-11-01.json) records
the initial guard failure, exact increments of 3, 16 and 1, and successful
read-only confirmation of all 20 model files and unchanged public content.

Release timing remains bounded: base visual compilation has a two-minute limit;
validated buildings with structural, facade or fine detail receive five minutes.
The complete 614-building/20-detailed-model local compilation measured 106.3
seconds, leaving only 13.7 seconds under the preceding two-minute limit; that is
a local measurement, not a hosted-runner benchmark. The release job allows 25
minutes for installation, tests, private asset hydration, compilation, uploads
and deployment. Vercel's nine-minute deployment wait, the 25-minute publication
lease, the 12 MiB base-visual limit and editable-document bounds are unchanged.

The model review mark represents review of the pinned proposed source, including
its estimates. The three identification holds and four further evidence gaps
remain excluded. Native masters are in millimetres with Z up; imported editable
models are anchored local metres. Estimated dimensions are not survey results.

A failed upload leaves reusable private immutable assets. A failed save is atomic.
After any successful save, the receipt retains the operation ID and backup path
even if submission fails. Inspect that receipt and the live draft before retrying;
prepare fresh hashes rather than overwriting concurrent edits or automatically
restoring a backup. The full rollback copy remains in the private `campus-imports`
bucket and is never included in Actions artifacts or public campus packages.
