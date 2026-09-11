# Editing the campus map

The private `/admin` workspace edits the existing campus map in 2D or a tilted 3D view. Drafts stay visible while you work. Campus navigation changes only after a release is reviewed and published.

## Map an entrance and its approach

1. Search for a building or choose an item in **Needs mapping**. Select the building on the map, then choose **Add entrance**.
2. Click its ground footprint edge. Check the place association and give the entrance a useful name, such as “Library west entrance.” Several entrances can serve the same place.
3. Choose **Draw connecting path**. The first point starts at the entrance. Click to trace the actual approach and finish on a highlighted existing path or junction. Press **Enter** or **Finish**.
4. The editor creates a junction even in the middle of an existing path. Crossing a line without explicitly placing a connecting vertex does not join the routes. **Join here** connects an intentional crossing later.
5. Open **Test route**, choose starting and destination places, and preview the walk. Routing chooses the shortest permitted route through the available entrances and names the selected destination entrance.

Use the inspector to change access, direction, steps, building heights, labels, or connections. Drag vertices to adjust geometry; drag a midpoint to insert a vertex. Moving an established junction updates connected paths together. Mark a closure by selecting the actual graph segment; its reverse direction is also blocked. An expected reopening date never reopens a path automatically.

## Views and controls

| Control | Action |
| --- | --- |
| 2D / 3D | Change view without losing your drawing or selection; the preference is remembered. |
| Tilt / rotation / north arrow | Orient the 3D view. Mouse rotation also works. |
| Buildings slider | Adjust building transparency; entrance and outline tools automatically expose ground footprints. |
| Compare base | Temporarily show approved source geometry without draft corrections. Finish an active drawing first. |
| E / P / B / M | Add entrance / draw path / draw building / add place. |
| Enter / Escape | Finish / cancel a drawing. |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo a complete edit, including properties and connections. Cmd works on macOS. |

Known heights are rendered normally. Unknown heights use muted illustrative 6 m blocks **only in the editor**. These placeholders are never stored as measurements or exported into campus packages. Documented floor counts use the existing estimate of 3 m per floor. This editor models outdoor ground-level geometry, not building interiors or terrain.

The desktop layout provides the full workspace. Smaller screens support review, property changes, point placement, and moving features. Green draft geometry is new, purple is modified, amber needs attention, and red marks deletion.

## Saving and recovery

Completed edits autosave after 750 ms of inactivity. Related changes, such as an entrance and its approach or a moved junction, save in one database transaction. Incomplete topology can be saved privately but must be repaired before publication.

The status distinguishes **Saving**, **Saved**, and **Saved locally**. Interrupted requests retry with the same operation ID. The browser keeps an owner-scoped IndexedDB recovery copy, including unfinished drawings and undo history. Reopening the editor offers **Resume drawing**. A failed storage write is reported rather than represented as a successful recovery save.

If another session changes a draft, local work is preserved. Review the conflict, then choose **Keep my changes** to save against the latest revision, or **Use server draft**. **Export backup** includes both the server records and local work. Reconnecting resumes queued saves when authentication remains valid.

**Sources**, **Reports**, and **Releases** retain their separate review workflows. Building a release first flushes pending saves and validates the saved draft. The release worker independently validates the immutable snapshot before packaging it. Publishing and rollback retain the existing release controls.

## Upgrade and verification

Apply `supabase/migrations/003_editor_batches.sql` once to the existing database **before deploying this editor and API**. For a new database, apply migrations 001, 002, and 003 in order. Migration 003 adds the service-role-only batch function and operation receipts; it does not modify published map packages. Retain operation receipts so delayed retries remain idempotent.

Migration 003 was applied to the TurnRight Supabase project on 11 September 2026. Live verification confirmed that receipt RLS is enabled, anonymous and authenticated roles cannot execute the function, and the service role can. The implementation passed 84 unit/database tests, six real MapLibre/Terra Draw browser tests, seven Python tests, lint (existing warnings), and a production build on Node 22.23.2.

Use Node 22.13 or later in the 22.x line:

```sh
cd web
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

Unit tests exercise topology, entrances, route selection, recovery, and concurrency. Database tests run the real SQL migrations in PGlite PostgreSQL; only the unused PostGIS extension declaration is omitted. Browser tests use the actual MapLibre renderer and Terra Draw interactions with test-only authentication and API responses, including both views, dragging, undo/redo, reload recovery, full campus rendering, and smaller screens.

Deploy to a configured Vercel preview after applying the migration. Check a real owner login, a saved entrance/approach batch, source review, and release preparation against Supabase before promoting the application. Publishing new campus data remains a separate reviewed operation.
