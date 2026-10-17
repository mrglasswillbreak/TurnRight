# Source updates

## ArcGIS Pro campus discovery

The October 17 discovery pass archives eight LASU and 44 UNILAG candidate layers separately from accepted sources. Every retrieved candidate has a comparison disposition; additions remain candidates, duplicates are not imported twice, conflicts retain existing corrections, and null geometry remains invalid. Survey dates are recorded independently from upload/modification timestamps. No explicit reuse licence appeared in the captured item metadata, so new use remains held pending an exact match to retained permission evidence. Existing permission for a recorded source does not cover a different item or publisher.

Use the [toolbox and portable-review procedure](CAMPUS-DETAIL-UPGRADE.md) before Pro access expires. Native geometry checks work on copied datasets and never repair the source automatically. Keep 2008 UNILAG imagery as historical reference. Source acceptance, presentation-only scenery and public release approval are separate decisions. Scenery recipes do not create surveyed trees, entrances, access claims or routing obstacles.

Open **Review → Source updates** to check connected sources, inspect proposed map changes, and accept or reject a selection. The workflow is **check → review → publish**. Accepting source data changes the private source baseline; it does not publish the public map. Saved editor corrections continue to take precedence.

## Preview the whole inbox on the map

Choose **Preview all matching changes on map** to draw every pending proposal that matches the current filters, across all inbox pages. Additions are green, changes amber and removals red with dashed outlines. **Show previous shapes** adds grey dashed outlines; **Fit all changes** frames the loaded proposals. Click a shape to open its existing comparison, or use an inbox row for keyboard access. On phones the preview opens the Map view; List and Details remain available above it.

The count shows progress and reports records without a map location. Routing links are drawn between their referenced nodes, using current and proposed node positions for the corresponding outlines. Missing endpoints remain clearly counted as having no location. Large shapes are simplified or represented by their bounds; the detail comparison loads exact geometry. The overlay represents source proposals, with saved editor corrections still taking precedence. It does not select, accept, reject or publish anything. Refresh after imports or decisions; the preview time is shown under **About this preview**.

Migration **043** provides a campus-authorized, read-only geometry endpoint. Each sequential request decodes at most 50 proposals and returns at most 80 vertices per before/after shape, with a five-second statement timeout. A fixed creation cutoff excludes later imports from pagination. Filters and closing the preview cancel pending client reads; ordinary status polling never fetches preview geometry. There is no geometry cache or backfill to retain.

Migration **044** adds indexed, campus-scoped endpoint lookups for routing links. Each link reads only its two node references for each side. Pending node proposals use the same import cutoff; additions and removals have no location on their absent side. The preview never loads the entire routing graph or substitutes editor correction geometry for source evidence.

![All filtered proposals previewed together while source decisions remain separate](assets/screenshots/source-map-preview-desktop-2026-10-11.png)

_Read-only preview with 101 synthetic proposals over the checked-in LASU seed. [Capture scope](SCREENSHOTS.md#map-previews-and-adjustable-phone-panels--11-october-2026)._

![Source inbox with readable rows, map comparison and retained editor corrections](assets/screenshots/source-updates-desktop-2026-10-11.png)

_October 11 browser capture with 101 synthetic proposals and isolated API responses. Counts and names are examples, not a production inventory._

## Check sources

Expand **Connected sources** for each source's latest activity, last successful check, schedule, and pending count. **Check now** reuses the source's saved mapping and queues review proposals. An active check is reused instead of starting another download. **Finish setup** opens Imports when mapping is incomplete. Uploaded files use **Replace file** rather than automatic downloads.

Campus administrators can choose manual or daily checks. Daily OSM checks remain unavailable unless an Overpass endpoint permitting scheduled downloads is configured in both the deployment and scheduler. LASU's existing OSM/ArcGIS checker appears separately as a shared daily check. It is not converted into duplicate per-source schedules. Scheduled jobs can start later than their configured time.

## Understand an update

Search by feature name, layer, or ID. Filter by source, layer, feature type, addition/change/removal, and whether the geometry changed. The inbox shows 50 lightweight summaries per page; opening an update loads its full comparison.

Named features use their names. Unnamed features use their type, layer, and a short identifier. **Current source** and **Proposed source** show changed fields. Red and green outlines locate the comparison on the map. Saved editor overrides are called out separately, and **Technical source records** retains the original details. Supported descriptive fields can still be accepted individually.

A missing snapshot record is not proof of source deletion. Updates show **Ready to review**, **Needs verification**, or **Blocked**, together with the reason, source check and dependency count. A path and its dependent routing changes form one decision. **Inspect dependent records** distinguishes source shapes, routing segments and junctions. Shape and access changes still need inspection; bulk acceptance is not an automated quality judgement.

On a phone, use **List**, **Map**, and **Details** to move between the inbox, map, and comparison. Selection checkboxes and navigation controls support keyboard use.

## Accept or reject multiple changes

1. Select individual rows, **Select this page**, or **Select all matching results**. Individual selections persist across pages. Changing a filter clears the selection and explains why.
2. Choose **Accept selected** or **Reject selected**. The server freezes the selected proposal IDs and revisions and displays the exact addition/change/removal breakdown. Acceptance excludes blocked groups and states how many were excluded. Blocked groups may still be inspected or rejected.
3. Inspect geometry warnings. Accepting removals requires an additional acknowledgement.
4. Confirm the decision. Unsaved or conflicted editor work must be resolved first.

The selection does not expand when a daily import adds proposals. Proposals whose revisions or source baselines change before processing are skipped for a fresh review. Rejection retains the existing baseline. Publication remains a separate, independently reviewed workflow.

| Phone inbox                                                                                                      | Review before confirming                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ![Phone source list with accessible selection controls](assets/screenshots/source-updates-mobile-2026-10-11.png) | ![Frozen bulk selection with geometry and removal warnings](assets/screenshots/source-updates-confirm-mobile-2026-10-11.png) |

## Background progress and recovery

Bulk decisions continue after closing the editor. **Activity** and **Recent decisions** show progress, completed/skipped/failed counts, and paged results. One bulk operation runs per campus at a time. GitHub Actions may briefly queue a worker before processing starts.

**Stop remaining** stops before another batch; already completed decisions remain applied. **Retry unfinished** resumes pending items from a failed or cancelled operation. **Resume worker** re-dispatches an operation whose worker has not updated recently. Both use the existing receipt rather than creating another selection. Changed or invalid proposals require fresh inspection.

Unconfirmed selections expire after 24 hours. Detailed per-item bookkeeping and the retained ID/revision request list expire after 30 days once an operation is terminal. Operation summaries and the decision audit remain. This cleanup does not delete source features, editor corrections, published content, original uploads, or pending proposals. Pending proposals remain reviewable after disposable import artifacts expire.

## Deployment and maintenance

Apply migration **041_source_updates.sql** after migration 040. Run **Maintain source review index and receipts** before considering the new inbox ready. Its metadata backfill commits at most 100 records per request. The UI reports when the index is still being prepared.

The **Apply source review decisions** workflow uses the existing repository dispatch token and Supabase service-role secrets. It processes at most 25 decisions per transaction, with a 2-second lock timeout and 10-second statement timeout. Requests contain operation IDs and tokens, not proposal geometry. Audits and item receipts commit with their decisions; interrupted transactions can be retried safely.

The maintenance workflow runs daily at 05:22 UTC and is also manually dispatchable. Cleanup removes at most 1,000 expired bookkeeping rows per transaction. Import-file cleanup remains governed by migration 040 and its existing workflow.

API actions use the `source-updates-` prefix: overview, list, detail, history, prepare, control, and check. Read actions require campus access; preparation, decisions, and checks require editing permission. Schedule changes continue to require management permission. Browser roles cannot execute worker RPCs directly.

Browser capture commands and fixture scope are in [Screenshot maintenance](SCREENSHOTS.md#source-updates-capture-workflow). See [Production](PRODUCTION.md) for rollout status; this guide is not a deployment receipt.

See [Campuses and imports](CAMPUS-IMPORTS.md), [Editor guide](EDITOR.md), [Activity](PROGRESS-MONITOR.md), and [Deployment](DEPLOYMENT.md).

## Reliable comparisons and evidence

Migrations **045–048** introduce a shared comparison pipeline for LASU and connected OSM, ArcGIS, Overture and file inputs. Both adapters keep their existing download and geometry conversion tools, then call `scripts/source-check-worker.mjs`. The retired per-record import finalizer rejects old workers. LASU no longer inserts proposals or supersedes the campus inbox directly.

Three stores have separate purposes:

| Store                                     | Purpose                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream observations and check receipts  | What the provider returned, original retrieval time, content hashes, native IDs, completeness, query boundary, mappings/importer versions and provider revision when available |
| Accepted observations and feature lineage | The upstream version accepted by a human and its derived shapes, places, nodes and routing segments                                                                            |
| Editor corrections                        | Saved owner changes, held separately and preserved through source review and undo                                                                                              |

Checking or staging data never advances accepted observations or `accepted_import_id`. Receipt times do not participate in semantic comparison. Cached snapshots retain their original retrieval time; a file modification time cannot substitute for missing evidence. The published, transformed routing graph is never the accepted upstream baseline.

Identity uses provider, collection and native ID. Rebuilt routing segments require explicit ancestry and identical endpoint identities to match. Unchanged upstream content produces no routing replacement or removal proposals. Mapping, boundary and importer changes are identified separately. Incomplete collections and collections with duplicate or missing native identities hold their features and shared dependencies while independent complete collections can remain reviewable. Loss greater than 20% is measured within each upstream source/collection/feature-type partition, without offsetting additions.

Removal verification is conservative:

| Source           | Required evidence                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSM              | Original object status and history; a matching invisible latest version, not an unexplained 404. See the [OSM API](https://wiki.openstreetmap.org/wiki/OpenStreetMap_API).                                                                                      |
| Queryable ArcGIS | Native ID queried without the campus spatial filter, stable layer/schema identity, complete response and unchanged editing revision. See the [ArcGIS query API](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/). |
| Embedded ArcGIS  | A second uncached item retrieval with the same collection identity/schema, complete comparable feature content and unique native IDs.                                                                                                                           |
| Overture         | A separately downloaded, pinned release and extract with matching complete snapshot content and stable identities.                                                                                                                                              |
| Files            | An explicitly selected complete replacement and stable identifiers. Ordinary uploads cannot authorize removals.                                                                                                                                                 |

A still-existing object outside the boundary or mapped classification is a scope change. Missing identities after configuration changes remain blocked. There is no manager override for insufficient removal evidence. Every acceptance path, including legacy and descriptive-field endpoints, uses database eligibility guards. New group decisions require the exact displayed revision; an older client must reopen the comparison. Routing changes also check current dependency hashes, graph endpoints, saved corrections, entrances and protected connections within the same transaction.

An incomplete connected ArcGIS layer or LASU Overture collection is held individually. Its receipt records the failure, and the comparator holds shared dependencies. Otherwise independent complete collections can still be reviewed. The legacy LASU converter joins ArcGIS places with OSM routing: when that joint conversion fails, both dependent inputs are held while independently retrieved Overture data can still be compared. Retained published content may supply conversion context but never establishes accepted upstream state or replaces the workspace. Independent Overture confirmation uses a new download directory and HTTP cache revalidation.

## Guided private undo

Choose **Load check history** to inspect check receipts, incomplete downloads, blocked groups and historical findings. **Verify again** starts a fresh check. On an accepted decision, **Preview undo** lists affected source records and dependencies. Confirmation rechecks accepted records and observations against the decision receipt and creates a new immutable reversal receipt. It preserves later editor corrections. Later accepted changes or dependent corrections that would be removed block the affected group.

Undo changes only the private workspace. Even a decision already included in a public release requires a new independently reviewed publication to change the public map. Whole-map baseline replacement remains retired. Legacy accepted decisions without enough retained evidence can be inspected but cannot be automatically reversed. The existing 908 LASU rejections are not changed by these migrations or workers.

See the [desktop and phone recovery captures](SCREENSHOTS.md#source-reliability-and-private-undo--13-october-2026) for the tested interface with synthetic decisions.

## Bounded operations and retry behavior

Checks claim one source at a time with immutable run tokens and a revision-consistent baseline. Staging uses at most 100 records and 384 KiB per client request (the database retains its 512 KiB ceiling). Observation headers and derived records are staged separately. There are at most 300,000 entries per staging part; import feature and upload limits remain in force. Finalization validates complete manifests and commits proposals together. It supersedes only the same source's successfully checked collections. Stale workers, changed baselines, cancelled imports and revoked initiating permissions cannot finalize.

Verification receipts are checkpointed every 100 identities and frozen per run before proposal staging. Lost responses can be retried with the same token and identical payload; altered retries fail. Individual public-service verification is bounded to 300 missing identities and ten minutes per run; additional cases remain unverified with an explanation to narrow the collection. Declared file replacements need no public-service requests, and an Overture confirmation covers a complete collection. Interrupted runs reuse checkpointed evidence; a claim with no progress for 30 minutes can be replaced by a new run. Check history records the interruption.

Connected decision groups have an atomic limit of 1,000 records. Larger groups stay blocked; no partial group is applied to meet a batch limit. Individual evidence exceeding a request limit is represented by its identity/hash with an explicit blocked explanation; simplify or split that source and recheck. Original import artifacts referenced by checks remain protected from cleanup. Accepted observations, lineage and immutable before/after decision receipts are retained independently of disposable bulk-operation bookkeeping.

Identical rejected changes remain rejected. Changed content creates a new revision. A previously superseded or explicitly reversed decision may return to the inbox on a new check without erasing its history. Read pages remain 50 lightweight summaries, frozen bulk selections remain limited to 10,000 groups, and existing short bulk transactions remain bounded.

Additional private API actions are `check-detail`, `group-detail`, `reverify`, `decisions`, `provenance`, `undo-preview`, and `undo-confirm`, using the `source-updates-` prefix. Read and mutation permissions are checked separately and remain campus-scoped.

Raw comparison snapshots use compressed, shared batches so unchanged daily checks do not create another complete copy of the database. The two latest successful raw snapshots per source remain available for legacy-provenance inspection. Older unused raw snapshots expire, with the expiry shown in check history; their durable receipts, counts and hashes remain. Observations and routing records referenced by proposals, accepted state or any decision's before/after recovery history never expire with these snapshots. Compaction copies and verifies legacy evidence before reclaiming duplicates and does not change the map or past decisions.

## Staged reliability rollout

1. Apply migrations **045, 046, 047 and 048** in order before changing workers. The database guards are active immediately; new proposal generation defaults to disabled for every source.
2. Deploy the shared workers and review interface. Run shadow comparisons and inspect receipts. Shadow checks retain evidence but do not insert actionable proposals or modify map content.
3. Audit legacy provenance through **Inspect legacy provenance**. Recovery requires exact native/record identities, exact content and a retained historical accepted decision at or after the original retrieval. An operator may apply only these exact matches using `source_provenance_backfill(actor, check_id, true, page_offset)`, in pages of 100. It attaches evidence only; it never replaces map content. Unknown provenance remains blocked.
4. Run the LASU public regression, the authorized private-record replay, provider fixtures, database and native GIS acceptance gates. Keep the source disabled if any gate fails. Review historical findings without changing past decisions.
5. Enable verified proposal generation individually using an administrative database session, after examining that source's shadow receipts:

   ```sql
   insert into source_check_policy(campus_id, source_key, enabled)
   values ('lasu', 'lasu-enrichment', true)
   on conflict(campus_id, source_key) do update set enabled=excluded.enabled;
   ```

   Connected imports use `import:<campus_sources.id>` as their source key. Enabling generation does not accept proposals or publish a map. Run another check after enabling; completed shadow runs are immutable.

For rollback, set the relevant policy's `enabled` value to `false`. Keep migrations and database guards installed. Accepted data, corrections, existing decisions and recovery receipts remain available. Generation checks the policy during finalization, so disabling it also prevents an in-flight run from queuing new proposals.

The public regression fixture in `web/tests/fixtures/source-regeneration-lasu.json.gz` contains the archived October 12 path geometry and routing lineage with provenance hashes. It verifies 95 surviving paths, 908 disappearing generated segment IDs, zero whole-path removal proposals and review of the 20 differing path geometries. The private replay reads an authorized export only from the ignored local audit directory; private records must never be committed. Local test results and any unavailable native/device gates must be recorded in the implementation handoff; this guide does not assert production deployment.

The [October 13 implementation validation record](assets/source-reliability-2026-10-13.json) records local results and remaining deployment gates separately. It is not authorization to enable a source, accept a proposal or publish a map.
