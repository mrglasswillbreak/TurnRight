# Publishing the LASU Ojo model proposals

The proposal archive is an import source. It is not a campus replacement and its
existence does not imply architectural approval. The bridge currently accepts the
20 audited Ojo building IDs, preserving the published 614-building baseline,
existing private corrections, photographs, routing and other campuses.

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
