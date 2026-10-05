# Campus layers and road surfaces

Current navigation uses the [unified campus editor](UNIFIED-EDITOR.md): layer/data actions live in the catalogue and table, feature tools in Properties, and publication in Publish. Earlier dated captures below retain their original interface labels.

## Catalogue and attribute table

The left catalogue presents typed GIS datasets and campus drawing layers together, matched by explicit identities. Use an entry’s actions to open its attribute table or properties. **Edit geometry** opens a bounded feature session on the same map; topology-aware road and landscape tools remain in the feature inspector.

Dataset tables provide 100-row pages, private field overlays, aliases/units, required values/domains, filtering, sorting, statistics and saved filters. Configure categorical/graduated styles, proportional point symbols and labels; select public fields explicitly. GeoJSON/CSV/GeoPackage exports use selected/filtered data and provenance receipts. The legacy layer GeoJSON exporter continues to use mapped application properties.

The original layer table selects at most 500 matching features. Its header checkbox now measures the same bounded set and displays an indeterminate state for partial selection. Larger changes use staged analysis jobs and independent review. [Team workflow](GIS-PLATFORM.md).

The layer workspace is deployed. [Production receipts](PRODUCTION.md) record the released campus packages, browser checks and preserved drafts.

The catalogue opens by default on desktop. The catalogue, properties dock and bottom table resize independently; on phones, **Layers**, **Table** and **Properties** choose one sheet, with **Expand panel** for a full workspace view. Layer changes join ordinary feature corrections in transactional autosave, undo/redo, backups, recovery and immutable release snapshots. There is no visitor layer switcher.

## Find and edit a feature

Select a catalogue entry and open **Table**, then search its name, application ID or original source ID. This list includes all records independently of **Needs mapping**. UNILAG's road-surface layer contains all 179 source identities; searching `96` exposes the large repaired road polygon.

The map distinguishes **Road surface** from **Routing path**. Original routing geometry remains selectable beneath a clipped public centreline. An overlap chooser identifies the layer, class, name and source ID, with the active layer first. Hidden, isolated-away and locked layers do not intercept map clicks. Row selection centres the feature; checkbox selection highlights a group on the map. Bulk field edits and feature moves show affected counts before one undoable application.

Road inspectors retain name, class, surface, width, unit and evidence. Metres are stored internally; feet are a display/input option. Clearing a width restores the illustrative fallback when generating a surface. Access, direction and connections remain separate routing controls. Land and overlay inspectors do not offer unrelated driving or photo controls.

Search or layer changes reset the virtual table to its first result. Arrow keys resize a focused dock separator; Home/End use its minimum/maximum size. Counts, search text and regeneration checks are cached between scroll events. Layer zoom limits remain effective when changing building opacity, model coverage or selection. [Audit evidence](AUDIT-2026-10-03.md).

## Organize the workspace

- Use **Add data → Create layer** for a new layer or folder. Entry actions open **Layer properties**, including names, parent folders, drawing order and expandable **Organize layers** controls. Drag between folders and reorder within a cartographic band. Landscape, surfaces, buildings and annotations have separate bands; routes and essential labels remain above map content.
- **Show while editing** affects the owner workspace. **Lock editing** prevents feature selection and editing. **Include in release** controls optional packaged content. **Published visibility** controls the released presentation. Temporary isolation changes neither saved nor published settings.
- Core boundary/routing dependencies stay packaged. Hiding or archiving their presentation does not grant or revoke access. The boundary itself is managed in Campus settings.
- Archive/restore is reversible and retains uploaded sources. Duplicating optional visual layers creates new feature identities with lineage. Zoom-to-layer and mapped-property GeoJSON exports are available in layer settings.

Layer styling resolves **feature override → first matching classification rule → layer default → campus theme**. Controls cover colour, dark colour, outlines, opacity, line width, point symbols, labels and zoom ranges. Reference overlays may remain editor-only. The public and offline packages carry the same reviewed configuration.

**Add data → Import spatial data / sources** opens the campus import task for uploads, refresh, field remapping, source history and diagnostics. Pending imports stay in source review; accepted content appears in the catalogue. Accepted import identities, not display filenames, establish membership. Raw source attributes stay private; exports contain mapped application fields and attribution.

## Geometry and linked widths

Land and generic overlays support up to **20,000 vertices per feature**; other kinds retain the 2,000-vertex limit and requests retain their existing byte limits. Large polygons expose a selected part/ring in windows of 100 editing handles; multipart lines and points use bounded windows too. All other vertices and holes stay intact. Imported coordinate precision is retained.

**Parts, holes and geometry tools** opens a lazy worker. Draw a cutting line or hole on the map, choose a part or interior ring, or merge a selected group. Generate a preview, inspect its before/after map, then apply. Cancellation terminates the worker; a changed workspace invalidates its preview. Splits retain the parent as a superseded identity and create stable children. Merges keep the first selected identity, retain lineage and supersede the others. Undo restores the complete operation; refreshed source records do not revive superseded corrections. Routing geometry uses the existing topology-aware tools.

**Preview linked road surfaces** uses a campus-local UTM projection. Explicit owner widths and documented source widths take precedence. Illustrative defaults are 6 m streets, 4 m service roads/tracks, 3 m parking aisles and 1.8 m footpaths. Road class does not imply paving, sidewalks or access. Buildings, water, wetlands, surveyed surfaces and duplicate generated coverage are excluded; unsuitable grades and unresolved geometry are reported.

Each derived surface stores its source road, effective width/evidence, generation version and source revision. Source geometry or width changes mark it stale. Width edits on linked surfaces also update the source road in the same command; the surface only changes after preview/apply. Manually reshaped, split, merged or removed surfaces are retained unless the explicit replacement option is selected. Surveyed road polygons do not reshape when their recorded width changes.

## Persistence and release

Migration **020_campus_layer_records.sql** adds the layer edit kind and versioned atomic save wrapper. Layers are campus scoped. Membership uses `mapLayerId`; the existing numeric path `layer` continues to describe grade separation. Older packages infer default layers. Older writers retain newer feature metadata and cannot write layer definitions without the layer API version.

Layer corrections appear in release review with affected content. Review and publication remain separate from saving. The September 30 enrichment workflow additionally freezes from each campus's previous published snapshot and records the complete live workspace hash, preserving unrelated private drafts. Any concurrent source or draft change invalidates publication. Current releases use the independently approved immutable submission selected in **Publish**; the previous owner release controls have been consolidated there.

[Editor guide](EDITOR.md) · [Import guide](CAMPUS-IMPORTS.md) · [LASU coverage](LASU-LAYERS.md) · [Production receipts](PRODUCTION.md)
