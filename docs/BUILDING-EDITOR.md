# Building appearance and model editing

The current owner workflow is the [unified Photo & model workspace](UNIFIED-MODEL-EDITOR.md). Open it from a selected building, or use **Appearance**, **Roof** or **Outline** to open a particular mode. **Details** and **Review** share the same building draft and history. The former long façade form and its one-shot Apply action are superseded.

## Select and place

Use the searchable hierarchy, mapped-wall list, face-on canvas or selectable 3D preview. Walls show their mapped length and review state; dimensions are measured from the labelled endpoint and model base. Numeric fields use metres at the editing boundary while saved façade coordinates remain compatible with existing renderers.

Move and resize on the canvas, enter dimensions, or nudge with arrow keys. The grid offers 0.01, 0.1 and 1 metre increments; Shift multiplies a nudge by ten and Alt bypasses snapping. Multi-selection supports alignment, equal gaps and mirroring. Groups, editable patterns, instance detachment, duplicate, copy-to-wall/building and independent named presets reuse the same command history. Copied layouts receive fresh identities and show a placement preview. Out-of-bounds details require explicit repair.

Generated windows and trim can be previewed and converted into editable details. Custom windows, doors, columns, balconies, canopies, parapets and trim do not create entrances or routing connections. Photographs are optional for explicitly illustrative designs. Observed details require matching photographic evidence; documented dimensions need measurement provenance.

## Appearance and geometry

Building defaults flow to wings and then walls. **Use inherited value** removes an override. Window spacing defaults to 4 m and supports 0.5–20 m. Unknown heights remain illustrative; a model is not a survey. Standard hip/gable roofs require a convex four-sided wing without a courtyard and a pitch that fits the height. Complex wings use the existing custom-roof triangulation.

Roof mode stores geographic control points, elevations, ridge/valley constraints and footprint attachments. Outline mode edits the existing mapped vertices rather than a second footprint. Courtyards remain open. Completed valid roof actions save automatically; an invalid intermediate plan remains local for repair. **Done editing roof** closes the roof controls. Outline and height changes can invalidate associated details or textures. Physical dimensions are preserved for explicit placement review; removed assignments stay recoverable through rematching.

## Draft, review and recovery

Each completed numeric edit or pointer gesture is one undoable command. The shared editor retains 100 actions, operation identities, owner-scoped IndexedDB recovery and optimistic conflicts. Selection, cameras, panel resizing and visibility/locking are editing state, not public model changes. Closing preserves unfinished fields and roof work. Storage failure is reported; it must not be treated as a successful local save.

Review is targeted: **Mark this wall reviewed** only reviews that wall. Copies and affected geometry require review. Source-photo replacement invalidates relevant evidence; captions and ordering do not establish a new wall match. Publication independently validates the immutable snapshot and assets through the normal preview/publish/rollback workflow.

## Rendering and compatibility

Enhanced rendering remains the default, with Simple 3D and automatic performance fallback. Public/editor theme preferences are shared; building colours remain recognizable in both themes. The model workspace preserves its camera during selection and completed detail edits. Lightweight drag previews do not regenerate the full mesh on every pointer move.

Meshes batch repeated geometry by material while carrying detail and repeated-instance picking identities. One model build runs at a time and only the newest pending revision is retained. Closing releases preview workers and GPU resources; failed builds retain the draft and offer **Retry model preview**. Architectural details have a separate revision from legacy geometry; selection and façade evidence notes do not request a rebuild.

The visual allocation remains **12 MiB for campus geometry/textures**, **8 MiB for globe assets**, and **64 MiB resident building textures**. Prepared offline installations include the lazy workspace. Public package schemas 1–3 and the database schema are unchanged. Private names, groups, patterns and presets use versioned draft JSON and are omitted from downloads. Older clients receive an update message before they can drop this metadata.

## Verification

[Current implementation and performance evidence](MODEL-EDITOR-VERIFICATION.md) replaces the old build-count and Apply/Cancel acceptance instructions. The earlier [roof coverage](BUILDING-ROOF-COVERAGE.md) and [photographic coverage](PHOTO-MODEL-COVERAGE.md) remain dated evidence inventories, not claims about newly surveyed geometry.

Physical Android/iPhone touch, real keyboards and outdoor/offline campus checks remain distinct from browser simulations. Application deployment does not publish architectural draft changes.
