# Walking surveys

Status: implemented; **awaiting physical field verification**. The feature remains owner-only. Survey evidence is private and applying it never publishes a campus release.

## Phone workflow

Open `/admin` and choose **Survey**. **Record new path** requests GPS after creating durable local recovery. Recording starts in north-up 2D. Panning stops location following; **Follow me** restores it. Keep TurnRight visible. Screen locking, changing apps, navigating away and signing out stop recording; returning requires **Resume**. Poor GPS keeps the recorder waiting, but the next accepted fix starts a separate segment.

**Mark entrance here** pauses the recorder and captures a recent usable fix. Position the ground footprint under the crosshair, choose **Place entrance here**, choose the place, name and walking access, then confirm. The pending marker is recoverable even before confirmation. Resume to record another section.

**Finish** opens review. Grey lines are the original recording, orange sections need review, and green sections have been reviewed. Purple points identify fixed anchors. The original samples are never edited by geometry adjustments. Select a section or tap a point, move the map under the crosshair, and use **Place here**. Controls support insertion, deletion, trimming, splitting, removing a section, undo and redo. **More map space** collapses the sheet. The existing 2D/3D controls remain available.

Enable **Connect to highlighted target** to connect to a mapped path segment, junction or another reviewed survey vertex. Both the 12-pixel and 5-metre limits apply. Crossings alone do not create junctions. Signal gaps are never bridged automatically: rewalk a missing section or explicitly draw and review a connecting section. Confirm each section before applying. Entrances moved away from their original path anchor need an explicit connection.

**Save survey** preserves evidence on the phone and queues a private upload when offline. **Apply to map draft** creates editable map corrections through the existing atomic batch API. Connections must be usable and topology must validate. Applying the same survey again uses the same correction identities, including deletions from a previously applied survey. Close the survey panel to use the editor's route tester. Publication remains a separate reviewed release.

## Correcting a path

Choose **Correct existing path**, select a mapped path and two boundary vertices, then record. Review shows the previous path beneath the proposed section. Shared junctions, restricted edges and closure boundaries are pinned; the new line must meet these anchors in order. Geometry outside the section, source metadata, access, directed edges and closure ancestry are retained. A restricted gap cannot be included in a replacement.

Move the crosshair to a purple anchor before choosing **Use fixed anchor**. Moving a shared junction is a separate editor command. If the target changed, **Review replacement target** captures its current geometry and revision while preserving the recording for another review. A stale target cannot be silently overwritten.

## Recovery and sync

`survey-model.ts` contains configurable acceptance constants and pure geometry processing. `gps-acquisition.ts` is shared with navigation, while `survey-recorder.ts` owns the survey's explicit-resume policy and wake lock. `SurveyPanel.tsx` renders the survey overlays and touch review controls. The editor workspace is only involved when reviewed geometry is applied.

Accepted fixes must be finite, within the editor's mapping area, have positive reported accuracy no worse than 15 metres, be at most 10 seconds old, and have increasing timestamps. A speed above 4 m/s is rejected. Accuracy is labelled good through 8 metres and usable through 15 metres; these labels describe the device estimate, not surveyed precision. Stationary movements below 2 metres are suppressed. Simplification uses 1.5 metres and preserves endpoints and entrance anchors. Gaps longer than 15 seconds end a segment.

The `turnright-surveys` IndexedDB database stores samples independently of editor undo history. Control transitions are persisted immediately. Upload snapshots live in a separate store so queued raw chunks are not copied into every GPS write. Optimistic local revisions detect another tab changing recovery data; recording pauses rather than overwriting it. Storage failures stop GPS and expose a recovery-copy action. A recovered recording always opens paused. Signing out locks the owner's cached workspace and surveys.

**Prepare for offline survey** verifies the owner through the server, downloads and checks the campus package, checks the service worker, and caches the editor context. Preparation must succeed while online. Offline startup uses the previously verified owner's cache. Server sync still requires authenticated owner access; cached identity does not authorize API mutations.

Private sync uses immutable revisions, chunks of at most 250 samples and operation identities. A revision becomes current only after all chunks exist. Lost responses replay the same operation. Concurrent versions are retained for explicit resolution in **Saved surveys**. Retrieval fetches chunks in bounded pages only when opening a survey; normal editor state never includes tracks. Raw samples, sample timestamps and private evidence links are not assembled into public campus packages. Public schema version remains 1.

The editor's **Install update** notice requires paused recording and flushed recovery/draft writes. A service-worker update from another tab does not automatically reload an active recorder.

## Migration and deployment

1. Run `supabase/migrations/004_private_surveys.sql` in a transaction on the existing Supabase project, after migration 003. It adds `surveys`, `survey_revisions`, `survey_chunks` and the service-role-only `save_survey_revision` function. Authenticated reads are restricted to each row's owner.
2. Verify owner reads, denied direct authenticated writes, unauthorized API rejection, a chunked upload, a retry and a concurrent-version conflict.
3. Deploy the application to the existing Vercel preview branch and verify through the real owner session. Prepare offline, reopen a private survey, apply a temporary draft and undo it. Do not publish source changes or campus data during this check.
4. Deploy production only after preview verification. Existing installed apps can install the update from their public map settings; subsequent releases expose the notice inside the editor as well.
5. Run the physical-device checks below. Keep the field-verification label until both platforms pass.

Current rollout gate: migration 004 and authenticated preview verification require restored access to the signed-in Supabase/Vercel browser session. Browser automation returned `Unable to load browser request-header policy`; no production deployment or campus publication has been performed for this update.

## Physical field record — pending

Simulated GPS is not field verification. No physical walks have been recorded for this release yet.

| Check | Android Chrome | iPhone Safari | Installed web apps |
| --- | --- | --- | --- |
| Device, OS and browser versions recorded | Pending | Pending | Pending |
| Record a path and two entrances; adjust, connect, reopen, route | Pending | Pending | Pending |
| Accuracy near buildings and stationary drift | Pending | Pending | Pending |
| Screen lock, switching apps and explicit resume | Pending | Pending | Pending |
| Wake-lock loss, battery use over a 30-minute walk | Pending | Pending | Pending |
| Prepare offline, restart offline, record and reconnect | Pending | Pending | Pending |
| Interrupted uploads, expired authentication and version conflict | Pending | Pending | Pending |

For each walk, record start/end time, device/browser versions, reported accuracy ranges, distance against a known path, battery percentage before/after, interruption outcomes and any required geometry repair. Keep raw field evidence private. File any failure against the recorder, review, recovery or sync module before removing the label.
