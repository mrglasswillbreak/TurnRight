# Building appearance and custom roofs

The public map and editor share one compact view button: it shows 3D while viewing 2D, and 2D while viewing 3D. Tapping it changes the view. Enhanced rendering is the default; choose Enhanced or Simple in the public Settings screen or the editor's Settings section. Existing saved Simple preferences are retained. There is no attached options menu.

Editor Settings also contains tilt and building opacity. Tilt follows the actual camera angle and is available in 3D. Opening or closing Settings keeps the map and inspector mounted, preserving selection, unfinished drawings and roof plans. View preferences do not create map edits or undo entries.

Selecting a building opens Appearance. Outline exposes the geometry handles, and Roof opens a wing roof plan. Connection drawing and survey work suppress models so that map targets remain usable.

## Editing

Use the Building / wing and Wall lists, or select an enhanced model surface. Building defaults flow to wings and then walls. Each overridden setting offers Use inherited value. Selection outlines do not replace material colours. Window spacing defaults to 4 m; supported spacing is 0.5–20 m. Heights with no measurement or floor count remain illustrative. Standard hip/gable roofs require a convex four-sided wing without a courtyard; pitch must fit within its total height. Complex wings use a custom roof plan.

A roof plan stores control points, elevations, ridge/valley constraints and attachments to footprint vertices. It does not store generated triangles. Draw lines on the plan, drag points, or use the coordinate and elevation fields. Surface selection shows calculated slopes. Courtyards stay open. Boundary-attached points follow their footprint vertex, and whole-wing translations carry interior roof points with them.

Unfinished roof work is saved in the owner's local recovery copy. Switching 2D/3D preserves it. Apply roof creates one undo step; Cancel roof restores the committed roof. An invalid or failed regeneration retains the last valid 3D preview and exposes Retry 3D preview. Complete or cancel unfinished roof work before preparing or publishing a release.

## Data and release contract

`appearance` and `buildingTopology` remain optional JSON properties. Legacy packages without mesh surface metadata remain readable. Stable wing, ring, vertex and wall identities are generated without saving an edit when an inspector opens. Vertex moves and ring reordering retain identities. Splits copy the original wall style. Ambiguous assignments require explicit review.

Appearance conflicts merge at individual fields and named surfaces. Geometry identity changes and their dependent surface assignments are reviewed together. Continuous control changes share one undo entry until blur, Enter, a selection change or another command. Recovery retains the pending save receipt and baseline version as before.

The browser worker and release builder import the same mesh and appearance code. Draft generation is debounced, ignores obsolete replies and retains unchanged catalogue models. Compatible published visual references can augment an approved source baseline without substituting geometry or routing data.

## Preview reliability

Slow map movement temporarily reduces decorative detail while retaining enhanced architecture and the selected building's details. Ending or interrupting a zoom/pan clears this temporary reduction and redraws the detail appropriate to the current zoom. Zooming back in restores windows and trim automatically, without using the view toggle. Outline, connection and survey work temporarily hide enhanced models; returning to appearance editing restores them and reuses visible sector meshes. This intentional pause has a status message.

A rendering failure shows simple buildings and an explicit **Retry enhanced 3D** action. Retrying replaces only the model layer, preserving the mounted map, camera, selection and roof draft. Worker failures separately retain the last valid preview and offer **Retry 3D preview**; another changed edit can also start a fresh worker. Reduced-detail and updating messages occupy a single status location.

The preview cache keeps each model and its content signature together, including up to eight recently inspected buildings beyond those actively needed. Revisiting an unchanged building restores its model. Save acknowledgements, name changes and surface selection do not restart geometry generation. Worker requests include visual references only for the buildings being rebuilt. Roof triangulation is reused when only the tool, selected point or selected surface changes.

Selection outlines follow wall and roof boundaries without drawing blue triangulation diagonals or window grids over the appearance. Closing properties clears the surface highlight. An outline change that removes the selected wing or wall immediately falls back to an available inspector target. Appearance colours and inherited-value links follow the editor theme; controls explain when hidden windows or a custom roof prevent standard settings from changing the preview.

Starting a roof focuses its drawing controls. Applying or cancelling returns focus to the roof editing button, keeping keyboard and phone users in the roof workflow when draft controls are removed.

Zoom regression coverage counts actual WebGL facade draw calls rather than only checking loaded model IDs. Chromium and WebKit both verify automatic restoration after a slow animated zoom and three zoom-out/zoom-in cycles across the extrusion, simplified and detailed thresholds, in both the public map and editor. Genuine renderer failures retain their separate retry action. These checks cover the detail state that the earlier model-presence tests missed.

The release workflow rebuilds the visual catalogue and sector assets from its immutable snapshot before packaging. It verifies generated meshes and asset integrity and retains the 12 MB sector budget and 300 KB gzip lazy-renderer budget. Application deployment does not publish campus drafts; the owner still reviews and publishes a release separately.

## Acceptance

Automated coverage includes stable surfaces, inheritance, concurrent field changes, roof geometry and invalid elevations, recovery and grouped history, editor/release mesh agreement and routing invariance. Browser acceptance covers integrated controls, selections and edits, worker recovery, preserved camera position and unfinished roof reload.

Validation on 14 September 2026: all 266 unit tests pass. Chromium and WebKit exercise touch roof drawing, invalid-height feedback, opacity and preview recovery. Production-service-worker acceptance verifies that an acknowledged wall edit and an unfinished roof survive cold offline reopening, and that applying the roof offline survives another reload. Preparing a workspace verifies real requests and package integrity even when the browser's connectivity hint reports offline.

Chromium also verifies worker timeout, crash, delivery failure and obsolete-reply handling. Client and server type checks, lint and the production build pass. The lazy renderer is 119.5 KB gzip against its 300 KB budget. Existing broad-chunk and lint warnings remain; no new check failures were introduced.

The single-button Settings follow-up passes nine Chromium scenarios and two production-offline scenarios. Coverage includes keyboard switching, shared rendering preferences, unavailable preference storage, live tilt and opacity, retained roof point/tool selection, drawing recovery and phone layout. The touch Settings flow also passes in WebKit. Browser screenshots were reviewed at desktop and phone widths.

A local build of the current published campus assessed 380 buildings and generated 55 models across 22 sectors. Every generated model matched the editor's shared generator, including geometry and materials. These checks used the published data as input without publishing a campus draft.

Real Android and iPhone checks remain required before campus release acceptance: cold offline reopening, appearance controls, touch wall selection, ridge/valley drawing, attached point movement, Apply/Cancel, undo/redo and selection at low building opacity. Browser emulation does not replace those hardware checks.

Building reliability follow-up, 14 September 2026: 270 unit tests pass, including removed-surface inspector recovery and boundary-only selection outlines. Chromium exercises 32 controlled slow frames without losing enhanced models, temporary outline suppression, an injected WebGL drawing failure and explicit renderer retry with an unchanged camera. Preview tests verify two unedited building visits plus a cached revisit require only two builds; a colour edit adds one build, while its save receipt and a subsequent name change add none. Worker tests cover timeout, crash, automatic recovery on another edit, explicit retry and obsolete replies. WebKit touch checks pass for roof editing, post-Apply focus and Settings. Production service-worker tests pass for model integrity repair and cold offline recovery of wall edits and unfinished roofs. Client/server type checks, lint and build/budget checks pass; the lazy renderer is 119.7 KB gzip against 300 KB. Existing toolchain warnings remain. This application update does not publish a campus draft.
