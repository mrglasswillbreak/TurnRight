# Unified campus editor

TurnRight's private editor uses one map-centered shell for campus data, geometry, models, photographs, surveys, analysis, review and publication. Enter through **/admin** or a campus/building handoff. Existing APIs, dataset identities, permissions and public package formats are unchanged; this interface update requires no database migration.

## Find the right tool

| Area | Actions |
| --- | --- |
| Campus menu | Switch campus, manage sources, import spatial data, open settings and manage campus memberships |
| Layers and data | Search the catalogue, change temporary visibility, open a layer's settings or dataset fields/style, and add spatial data or an asset CSV |
| Map | Select or create features; edit geometry; use contextual building, entrance, path and evidence tools; test routes |
| Properties | Inspect the selected feature; enter the existing building/roof/mesh or photo focus view |
| Table | One bottom attribute dock for the chosen catalogue entry; filters, columns, sorting, paging, statistics and dataset exports |
| Analyze | Search processing tools, use the current table filter/selection, inspect staged outputs, apply a new private layer, rerun settings and download exports |
| Review | Issues and immutable submissions, draft diagnostics, proposed source updates, duplicates and reports |
| Publish | Approved snapshots, exact release previews, publication, campus restoration and A4/A3 map layouts |
| Save status | Pending saves, connection/recovery state, synchronization and private backup downloads |
| Activity | Import, upload, local processing, GIS job and release progress |
| Search commands | Keyboard-searchable destinations and actions; open with Ctrl/Cmd K |

The old Data, Edit, Layers, Campuses, Sources and Releases tabs are consolidated into these destinations. **Review → Draft changes** retains baseline reconciliation, model blockers and route impact. It leads to independent submission; publication actions live in **Publish**.

## Work without losing context

Choose a catalogue entry, then open its table or properties. Dataset entries combine with campus layers only when their explicit identities match. Same-named sources remain separate. Imported fields and derived results stay private until deliberately selected for publication.

The map remains mounted when switching tasks. The table retains its filters, chosen columns, page and bounded selection during normal navigation. Analysis/review/publication forms remain mounted after their first visit. Closing a task restores the prior panel and selection. The feature inspector remains mounted behind tasks, retaining specialist inputs and history.

Building, roof, mesh and photo focus views keep their existing canvas engines, validation and Apply/Cancel behavior inside the editor frame. Close the focus view to return to the same campus context. Survey recording still uses explicit pause/stop controls. Finish unfinished geometry or pause recording before a conflicting transition.

The table uses 100-row dataset pages. Dataset map overlays query the viewport independently of table pagination, with up to five enabled overlays and 100 features per overlay. Partial results are labelled on the map; zoom in for detail. Interactive selection and geometry sessions retain their 500-feature limits. Revision changes invalidate cursors and editable pages while preserving filter and column choices. An older response cannot replace a newer query.

Immutable submission geometry remains a review overlay. It does not become editable draft selection.

## Save and recover

Geometry and ordinary property changes retain the existing 750 ms autosave, optimistic revision tokens, idempotent save receipts and personal IndexedDB recovery. The header also accounts for pending GIS requests and recovery writes.

Attribute cells save on leaving the field. Invalid or interrupted inputs remain marked **Unsaved attributes**, with a user/campus-scoped local recovery copy. When their base revision changes, review the current value before applying the retained input. Discarding an input removes only that local input. Shared queries and saves still require a connection.

Staged operations continue to require Apply or Cancel. Undo/redo act on the active map/model context; table requests do not pretend to enter geometry history. Resolve errors and unfinished work before campus changes, sign-out or app-update installation.

## Responsive and keyboard use

Desktop opens the catalogue and keeps the table closed initially. Drag a dock edge or focus its separator and use the arrow keys to resize it. Sizes are remembered per user and campus on the device.

At narrower widths, Layers and Properties choose one side dock. Phones use one sheet at a time; **Expand panel** opens the active table/task/catalogue at full workspace height. **Restore panel** returns to the map view. Controls retain light/dark theme tokens and visible keyboard focus.

## Verification and rollout

Automated coverage includes the existing editor/import/model/photo/survey journeys plus shared task forms, table selection and filters, invalid-input recovery, map DOM continuity, bounded viewport queries, keyboard dock resizing and narrow-screen expansion. Browser fixtures use the real React/MapLibre application with isolated authentication and API responses.

Run unit, both TypeScript projects, lint, configured build/budgets, Chromium, WebKit, offline and native GIS gates before release. See [acceptance](ACCEPTANCE.md), [performance](PERFORMANCE.md) and [production receipts](PRODUCTION.md) for measured outcomes and remaining physical-device/live-service checks. A passing mock workflow is not evidence of a live multi-user publication.

Deploy a feature-branch preview first. Preserve the previous immutable application deployment for rollback and retain current public campus packages. This UI rollout does not publish campus edits or require a migration.
