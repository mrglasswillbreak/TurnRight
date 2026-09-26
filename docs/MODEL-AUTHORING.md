# Reference editing and authored models

The model workspace combines native building surfaces with editable objects. Open a building's **Edit model** button. Architectural height, floors, roofs, windows and text remain available; **Mesh** adds object and component editing. Authored objects attach to the building. Its geographic footprint remains authoritative for routing.

Choose the campus first. Buildings, authored model assets, photos, recovery and release snapshots belong to that campus; identically named or identified buildings in another campus do not share their drafts. [Campus workflow](CAMPUS-IMPORTS.md).

## Work beside a photograph

Turn on **Reference split** to show the existing photograph panel beside one model pane. Orbit and Edit surface change that pane without replacing the renderer. Photograph selection, zoom and texture alignment remain independent. The preference and divider position are remembered on this device.

The centre region must provide at least 720 × 320 CSS pixels. The model keeps at least 420 px and the photograph at least 280 px, with a 12 px divider. Enabling the split collapses structure if necessary. Smaller windows temporarily return to tabs; widening restores the preference. Focus the divider and use arrows, Home or End, or drag its touch-sized hit area. Phone sheets and tablet properties keep their existing arrangement.

![Model and photograph reference beside each other](assets/screenshots/reference-editing-2026-09-26.png)

## Add exterior walls and curves

In **Outline → Add wall**, choose one of three operations:

| Operation | Behaviour |
| --- | --- |
| Replace boundary between vertices | Start at the selected vertex, choose an existing end vertex, and draw the replacement path. |
| New wing | Close a new exterior outline using points, a circle or an ellipse. |
| New courtyard | Close an interior outline in the selected wing. It must fit within the exterior boundary. |

Tap the aligned model or enter east/north metre coordinates relative to the building's fixed editing origin. Existing vertices snap exactly; free points use a 0.1 m grid. **Apply boundary** commits one undoable operation. Invalid drawings remain available for repair; **Cancel boundary** removes only the preview.

![Exterior boundary and courtyard creation](assets/screenshots/add-wall-courtyard-2026-09-26.png)

Expand **Curves and rounded corners** to turn the selected edge into a circular arc or cubic Bézier curve, restore a straight edge, or round a corner. Curves keep editable controls and logical identities. Generated segments are deterministic, with bounded subdivision; derived points cannot be independently moved. Move an anchor or change the curve controls instead.

Curved-wall details use distance along the wall and height. **Details → Edit surface** exposes a section selector and aligns to the chosen part of the curved elevation. Its projected handles map back to the same distance coordinates. Unaffected wall identities survive boundary changes. Reassigned or reshaped facade records require review, and incompatible roof plans remain recoverable through the roof repair flow.

![Editable curved boundary on the model](assets/screenshots/curved-wall-outline-2026-09-26.png)

## Mesh and profile tools

**Mesh** provides box, plane, cylinder, cone, sphere and torus primitives, plus editable elliptical and custom curve profiles. Close a profile and set its extrusion depth. Profiles stay parametric until **Convert to mesh**. To edit a native building as mesh geometry, use **Create editable mesh copy**; its source remains intact. **Replace building visual** is a separate undoable choice.

Select **Object, Vertex, Edge or Face**. The structure tree and object selector address the same objects as 3D picking. Component identities are independent of renderer triangle indices. Use Shift selection or the explicit multiple-selection control on touch. Numeric transforms, axis constraints and grid snapping accompany pointer Move, Rotate and Scale.

![Stable face selection and mesh commands in the shared viewport](assets/screenshots/mesh-editing-2026-09-26.png)

Object transforms include imported descendants. Locked objects or children must be unlocked before group operations. Face commands include extrusion, inset, subdivision, duplication and deletion; vertices can be merged. Inset requires one planar convex face and a distance that does not collapse it. Extrusion requires a manifold patch with a consistent normal. Component editing requires converting a parametric profile first. These restrictions produce actionable messages without replacing the valid draft.

Each gesture previews transiently and commits once. Escape, pointer cancellation or viewport resizing cancels its preview. Undo restores prior geometry and component identities. Deleting an object includes its descendants. Imported UV seams and material assignments remain per face corner; new extrusion sides receive metre-based UVs. Mesh editing requires WebGL. If rendering becomes unavailable, drafts remain recoverable and native surface editing retains its 2D fallback.

## Import and export

Choose **Mesh → Import model**, supply the main file and its companion files, then inspect the preview before adding it. The worker resolves dependencies only from the supplied files and embedded data. It does not download remote model dependencies. **Cancel** terminates parsing or export work. On browsers without worker Canvas2D, a bounded image-encoding bridge handles textures; geometry parsing and packing remain in the worker.

![Import preview, dimensions and conversion controls](assets/screenshots/model-import-preview-2026-09-26.png)

| Format | Import | Export |
| --- | --- | --- |
| GLB / glTF 2 | Static hierarchy, geometry, UVs and core metallic-roughness materials. | GLB is preferred. glTF exports a portable JSON document with an embedded binary buffer. Both use metres and Y up. |
| OBJ + MTL | Geometry, normals, UVs, diffuse colour/opacity and supplied diffuse textures. | ZIP containing OBJ, companion MTL and textures; explicit units and up axis. |
| STL | Geometry only; choose intended units and up axis. | Binary STL, geometry only; explicit units and up axis. |

The preview reports dimensions, complexity, material conversions and missing dependencies. Animation, rigging, morphs and unsupported material extensions are not retained; compressed glTF extensions must be removed by re-exporting first. Choose metres, centimetres, millimetres, feet or inches and Y/Z up as appropriate. Placement converts to local metres and can centre/ground the object at the building origin.

Export the whole building or selected objects with their descendants. Curves are tessellated and transforms baked. Supported appearance travels with the standard file; wall parameters, review metadata, stable authoring identities and undo history remain in the TurnRight project. Imported models are private until reviewed and published.

![Exporting the building with explicit format and units](assets/screenshots/model-export-2026-09-26.png)

## Save, review and publish

Version-1 model documents contain curves, explicit topology, transforms, materials, images and stable IDs. Authenticated saves upload immutable private JSON assets, verify SHA-256 and content limits, then store a small reference in the existing optimistic save transaction. Textures travel inside the private document; publication extracts them into independently hashed package assets. Local recovery remains owner- and campus-scoped, including unfinished imports and rejected candidates.

Migration **013_campus_isolation.sql** adds campus identity to asset metadata and draft saves. Migration **012_editable_model_assets.sql** creates the private `building-models` bucket and metadata table, enforces immutable asset identity and guards newer drafts against older clients. It is additive; geographic map storage and public package schema remain compatible. Deploy public readers and storage before enabling new-format writes. Do not roll a writing deployment back to a client that drops authored references.

The current authored revision must be marked reviewed in Mesh tools. Any subsequent geometry or material change requires another review. Releases hydrate and validate the immutable source, compile authored geometry and package supported textures. Only the existing owner **review → preview → publish** workflow changes public campus content. Ordinary application deployment preserves the published campus package.

| Limit | Current bound |
| --- | --- |
| Import input | 100 files / 50 MiB total |
| Model source | 100 objects, 100,000 vertices, 200,000 faces, 25 MiB JSON |
| Textures | 32 images, 4 MiB each, 4096 px per side, 16 megapixels combined |
| Curve profiles | 4096 generated points per profile |
| Owner model asset storage | 500 MiB |
| Published model package | Existing 12 MiB combined geometry and texture budget |
| Decoded authored textures | Shared, reference-counted 32-megapixel renderer budget |

Oversized or unsupported content stays private and recoverable. Reduce geometry/texture complexity before saving or publishing. Imported objects can cover a large footprint visually, but they never silently alter routing geometry. Interior layouts, sculpting and advanced modifiers are outside this release.

See [verification](MODEL-EDITOR-VERIFICATION.md), [deployment](DEPLOYMENT.md), [architecture](ARCHITECTURE.md) and [capture provenance](assets/screenshots/README.md).
