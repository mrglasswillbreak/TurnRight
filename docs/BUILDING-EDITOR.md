# Building appearance and custom roofs

The public map and editor share one 2D / 3D control. Enhanced rendering is the default in 3D; the attached rendering menu retains the existing Simple preference. Selecting a building opens Appearance. Outline exposes the geometry handles, and Roof opens a wing roof plan. Connection drawing and survey work suppress models so that map targets remain usable.

## Editing

Use the Building / wing and Wall lists, or select an enhanced model surface. Building defaults flow to wings and then walls. Each overridden setting offers Use inherited value. Selection outlines do not replace material colours. Window spacing defaults to 4 m; supported spacing is 0.5–20 m. Heights with no measurement or floor count remain illustrative. Standard hip/gable roofs require a convex four-sided wing without a courtyard; pitch must fit within its total height. Complex wings use a custom roof plan.

A roof plan stores control points, elevations, ridge/valley constraints and attachments to footprint vertices. It does not store generated triangles. Draw lines on the plan, drag points, or use the coordinate and elevation fields. Surface selection shows calculated slopes. Courtyards stay open. Boundary-attached points follow their footprint vertex, and whole-wing translations carry interior roof points with them.

Unfinished roof work is saved in the owner's local recovery copy. Switching 2D/3D preserves it. Apply roof creates one undo step; Cancel roof restores the committed roof. An invalid or failed regeneration retains the last valid 3D preview and exposes Retry 3D preview. Complete or cancel unfinished roof work before preparing or publishing a release.

## Data and release contract

`appearance` and `buildingTopology` remain optional JSON properties. Legacy packages without mesh surface metadata remain readable. Stable wing, ring, vertex and wall identities are generated without saving an edit when an inspector opens. Vertex moves and ring reordering retain identities. Splits copy the original wall style. Ambiguous assignments require explicit review.

Appearance conflicts merge at individual fields and named surfaces. Geometry identity changes and their dependent surface assignments are reviewed together. Continuous control changes share one undo entry until blur, Enter, a selection change or another command. Recovery retains the pending save receipt and baseline version as before.

The browser worker and release builder import the same mesh and appearance code. Draft generation is debounced, ignores obsolete replies and retains unchanged catalogue models. Compatible published visual references can augment an approved source baseline without substituting geometry or routing data.

The release workflow rebuilds the visual catalogue and sector assets from its immutable snapshot before packaging. It verifies generated meshes and asset integrity and retains the 12 MB sector budget and 300 KB gzip lazy-renderer budget. Application deployment does not publish campus drafts; the owner still reviews and publishes a release separately.

## Acceptance

Automated coverage includes stable surfaces, inheritance, concurrent field changes, roof geometry and invalid elevations, recovery and grouped history, editor/release mesh agreement and routing invariance. Browser acceptance covers integrated controls, selections and edits, worker recovery, preserved camera position and unfinished roof reload.

Validation on 14 September 2026: all 266 unit tests pass. Chromium and WebKit exercise touch roof drawing, invalid-height feedback, opacity and preview recovery. Production-service-worker acceptance verifies that an acknowledged wall edit and an unfinished roof survive cold offline reopening, and that applying the roof offline survives another reload. Preparing a workspace verifies real requests and package integrity even when the browser's connectivity hint reports offline.

Chromium also verifies worker timeout, crash, delivery failure and obsolete-reply handling. Client and server type checks, lint and the production build pass. The lazy renderer is 119.5 KB gzip against its 300 KB budget. Existing broad-chunk and lint warnings remain; no new check failures were introduced.

A local build of the current published campus assessed 380 buildings and generated 55 models across 22 sectors. Every generated model matched the editor's shared generator, including geometry and materials. These checks used the published data as input without publishing a campus draft.

Real Android and iPhone checks remain required before campus release acceptance: cold offline reopening, appearance controls, touch wall selection, ridge/valley drawing, attached point movement, Apply/Cancel, undo/redo and selection at low building opacity. Browser emulation does not replace those hardware checks.
