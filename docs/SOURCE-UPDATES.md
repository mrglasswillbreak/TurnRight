# Source updates

Open **Review → Source updates** to check connected sources, inspect proposed map changes, and accept or reject a selection. The workflow is **check → review → publish**. Accepting source data changes the private source baseline; it does not publish the public map. Saved editor corrections continue to take precedence.

## Check sources

Expand **Connected sources** for each source's latest activity, last successful check, schedule, and pending count. **Check now** reuses the source's saved mapping and queues review proposals. An active check is reused instead of starting another download. **Finish setup** opens Imports when mapping is incomplete. Uploaded files use **Replace file** rather than automatic downloads.

Campus administrators can choose manual or daily checks. Daily OSM checks remain unavailable unless an Overpass endpoint permitting scheduled downloads is configured in both the deployment and scheduler. LASU's existing OSM/ArcGIS checker appears separately as a shared daily check. It is not converted into duplicate per-source schedules. Scheduled jobs can start later than their configured time.

## Understand an update

Search by feature name, layer, or ID. Filter by source, layer, feature type, addition/change/removal, and whether the geometry changed. The inbox shows 50 lightweight summaries per page; opening an update loads its full comparison.

Named features use their names. Unnamed features use their type, layer, and a short identifier. **Current source** and **Proposed source** show changed fields. Red and green outlines locate the comparison on the map. Saved editor overrides are called out separately, and **Technical source records** retains the original details. Supported descriptive fields can still be accepted individually.

A removal means the record is absent from a source snapshot. It does not establish closure or demolition. Shape and path changes need map inspection; bulk acceptance is not an automated quality judgement.

On a phone, use **List**, **Map**, and **Details** to move between the inbox, map, and comparison. Selection checkboxes and navigation controls support keyboard use.

## Accept or reject multiple changes

1. Select individual rows, **Select this page**, or **Select all matching results**. Individual selections persist across pages. Changing a filter clears the selection and explains why.
2. Choose **Accept selected** or **Reject selected**. The server freezes the selected proposal IDs and revisions and displays the exact addition/change/removal breakdown.
3. Inspect geometry warnings. Accepting removals requires an additional acknowledgement.
4. Confirm the decision. Unsaved or conflicted editor work must be resolved first.

The selection does not expand when a daily import adds proposals. Proposals whose revisions or source baselines change before processing are skipped for a fresh review. Rejection retains the existing baseline. Publication remains a separate, independently reviewed workflow.

## Background progress and recovery

Bulk decisions continue after closing the editor. **Activity** and **Recent decisions** show progress, completed/skipped/failed counts, and paged results. One bulk operation runs per campus at a time. GitHub Actions may briefly queue a worker before processing starts.

**Stop remaining** stops before another batch; already completed decisions remain applied. **Retry unfinished** resumes pending items from a failed or cancelled operation. **Resume worker** re-dispatches an operation whose worker has not updated recently. Both use the existing receipt rather than creating another selection. Changed or invalid proposals require fresh inspection.

Unconfirmed selections expire after 24 hours. Detailed per-item bookkeeping expires after 30 days once an operation is terminal. Operation summaries and the decision audit remain. This cleanup does not delete source features, editor corrections, published content, original uploads, or pending proposals. Pending proposals remain reviewable after disposable import artifacts expire.

## Deployment and maintenance

Apply migration **041_source_updates.sql** after migration 040. Run **Maintain source review index and receipts** before considering the new inbox ready. Its metadata backfill commits at most 100 records per request. The UI reports when the index is still being prepared.

The **Apply source review decisions** workflow uses the existing repository dispatch token and Supabase service-role secrets. It processes at most 25 decisions per transaction, with a 2-second lock timeout and 10-second statement timeout. Requests contain operation IDs and tokens, not proposal geometry. Audits and item receipts commit with their decisions; interrupted transactions can be retried safely.

The maintenance workflow runs daily at 05:22 UTC and is also manually dispatchable. Cleanup removes at most 1,000 expired bookkeeping rows per transaction. Import-file cleanup remains governed by migration 040 and its existing workflow.

API actions use the `source-updates-` prefix: overview, list, detail, history, prepare, control, and check. Read actions require campus access; preparation, decisions, and checks require editing permission. Schedule changes continue to require management permission. Browser roles cannot execute worker RPCs directly.

See [Campuses and imports](CAMPUS-IMPORTS.md), [Editor guide](EDITOR.md), [Activity](PROGRESS-MONITOR.md), and [Deployment](DEPLOYMENT.md).
