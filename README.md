# TurnRight

**Find your way around LASU Ojo — online or offline.**

TurnRight is a campus walking and driving navigation PWA for Lagos State University, Ojo, with a private owner editor for maintaining paths, entrances, building appearances and reviewed releases. Search, routing, GPS processing and navigation audio run on the device.

[Open TurnRight](https://turnright.vercel.app/) · [Owner editor](https://turnright.vercel.app/admin) · [Deployment guide](docs/DEPLOYMENT.md) · [Report a software issue](https://github.com/mrglasswillbreak/TurnRight/issues)

![TurnRight campus map with the Senate Building destination and published architecture](docs/assets/screenshots/public-place-desktop-current-2026-09-26.png)

> **Project status:** An independent, non-commercial personal project, not an official LASU service. Routes and modeled details combine recorded sources, reviewed corrections and explicitly illustrative estimates. Campus routes have **not been field-verified**. A mapped approach is not a confirmed building entrance, and missing steps information does not establish step-free access.

## Contents

- [Screenshots](#screenshots)
- [Recent changes](#recent-changes)
- [Features](#features)
- [Quick start](#quick-start)
- [Using the public map](#using-the-public-map)
- [Driving on campus](#driving-on-campus)
- [Entrance guides and photographs](#entrance-guides-and-photographs)
- [Appearance and 3D](#appearance-and-3d)
- [Owner editor](#owner-editor)
- [Building appearance and roofs](#building-appearance-and-roofs)
- [Reference editing and authored models](#reference-editing-and-authored-models)
- [Review and publication](#review-and-publication)
- [Walking surveys](#walking-surveys)
- [Offline operation and recovery](#offline-operation-and-recovery)
- [Map data and coverage](#map-data-and-coverage)
- [Architecture](#architecture)
- [Configuration and hosting](#configuration-and-hosting)
- [Development and verification](#development-and-verification)
- [Repository structure](#repository-structure)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing and licensing](#contributing-and-licensing)

## Screenshots

Current production-build captures use the verified published campus **`lasu-7343cb96c9a5`**: 395 buildings, 220 places and 39 photographs. Public screens render the real application; editor screens use isolated owner/API fixtures and never expose a private account or change production drafts. The model canvas examples include explicitly illustrative local edits. Phone views are browser simulations.

### Public map

| Campus and destination · desktop | Adjustable destination panel · desktop |
| --- | --- |
| ![Campus and Senate destination in Light mode](docs/assets/screenshots/public-place-desktop-current-2026-09-26.png) | ![Desktop panel shortened using its keyboard-accessible resize handle](docs/assets/screenshots/public-panel-resized-current-2026-09-26.png) |

| Compact mobile map | Destination details | Settings | Offline download |
| --- | --- | --- | --- |
| <img src="docs/assets/screenshots/public-map-mobile-current-2026-09-26.png" width="240" alt="Mobile campus map with compact search dock"> | <img src="docs/assets/screenshots/public-place-mobile-current-2026-09-26.png" width="240" alt="Mobile destination details and building photograph"> | <img src="docs/assets/screenshots/public-settings-mobile-current-2026-09-26.png" width="240" alt="Mobile public appearance and navigation settings"> | <img src="docs/assets/screenshots/public-offline-mobile-current-2026-09-26.png" width="240" alt="Mobile offline package status and download controls"> |

| Illustrated globe · desktop Light | Illustrated globe · mobile Dark |
| --- | --- |
| ![Offline globe with campus colours, geographic labels and gentle relief](docs/assets/screenshots/public-globe-desktop-current-2026-09-26.png) | <img src="docs/assets/screenshots/public-globe-mobile-current-2026-09-26.png" width="260" alt="Dark globe and campus return control on a phone-sized screen"> |

| Walking route · desktop Dark | Walking route · mobile Dark |
| --- | --- |
| ![Offline-capable Clinic to Senate walking route preview](docs/assets/screenshots/public-route-desktop-current-2026-09-26.png) | <img src="docs/assets/screenshots/public-route-mobile-current-2026-09-26.png" width="260" alt="Mobile walking route with manual origin and mapped approach notice"> |

### Owner editor

| Workspace and feature explorer | Selected building with photographs at the top |
| --- | --- |
| ![Owner workspace, feature explorer and 3D campus](docs/assets/screenshots/editor-workspace-current-2026-09-26.png) | ![Building inspector with gallery preview, Manage photos and architectural tools](docs/assets/screenshots/editor-building-current-2026-09-26.png) |

| Mobile building inspector | Mobile editor settings | Unified model · mobile |
| --- | --- | --- |
| <img src="docs/assets/screenshots/editor-building-mobile-current-2026-09-26.png" width="260" alt="Selected building and compact inspector on mobile"> | <img src="docs/assets/screenshots/editor-settings-mobile-current-2026-09-26.png" width="260" alt="Mobile owner appearance, tilt and model settings"> | <img src="docs/assets/screenshots/editor-model-canvas-mobile-2026-09-26.png" width="260" alt="Full-screen mobile model workspace with measured wall canvas and precision controls"> |

**Selected-item actions:** the ⋯ menu keeps common commands beside the selection, with right-click and keyboard access.

<img src="docs/assets/screenshots/editor-model-actions-mobile-2026-09-26.png" width="300" alt="Selected detail action menu with edit, duplicate, copy, lock, hide and delete commands">

**Photo management:** review, arrange and edit building photographs independently from model details.

![Visual photo workspace with published building views and gallery controls](docs/assets/screenshots/editor-photos-current-2026-09-26.png)

**Edit model:** one workspace combines an expandable structure tree, a shared 3D viewport, surface-aligned editing, precision plans and photograph references.

![Unified desktop model workspace with selection, architectural properties and photographic reference](docs/assets/screenshots/unified-model-desktop-2026-09-26.png)

| Roof tools | Outline tools |
| --- | --- |
| ![Integrated roof mode and geographic roof plan](docs/assets/screenshots/editor-roof-current-2026-09-26.png) | ![Integrated footprint view with mapped vertices and geographic context](docs/assets/screenshots/editor-outline-current-2026-09-26.png) |

| Precise detail properties | Building height and floors | Mobile roof plan |
| --- | --- | --- |
| <img src="docs/assets/screenshots/editor-model-properties-mobile-2026-09-26.png" width="260" alt="Detail dimensions in a focused mobile sheet above the action bar"> | <img src="docs/assets/screenshots/editor-model-height-mobile-2026-09-26.png" width="260" alt="Building height controls inside the mobile Appearance mode"> | <img src="docs/assets/screenshots/editor-model-roof-mobile-2026-09-26.png" width="260" alt="Geographic custom roof plan with deliberate Move point control"> |

| Mobile outline plan | Photograph reference | Targeted review |
| --- | --- | --- |
| <img src="docs/assets/screenshots/editor-model-outline-mobile-2026-09-26.png" width="260" alt="Light-theme outline canvas with selected geographic vertices"> | <img src="docs/assets/screenshots/editor-model-photo-mobile-2026-09-26.png" width="260" alt="Building photograph reference with independent zoom and navigation"> | <img src="docs/assets/screenshots/editor-model-review-mobile-2026-09-26.png" width="260" alt="Mobile review sheet with wall-specific issues and actions"> |

The gallery covers the public app, desktop editor, mobile modes, surface text and responsive editing. [Capture inventory and reproduction](docs/assets/screenshots/README.md) records provenance and older archives. [Nineteen building comparison sheets](docs/PHOTO-MODEL-COVERAGE.md) provide separate photographic evidence and gaps.

| Landscape editing beside the model | Selection, grouping and nested structure |
| --- | --- |
| ![Landscape model editing with one collapsible properties panel](docs/assets/screenshots/editor-model-landscape-2026-09-26.png) | ![Nested model tree with selected-item actions and Ungroup](docs/assets/screenshots/editor-model-tree-actions-2026-09-26.png) |

| Individual window editing | Review recorded walls together |
| --- | --- |
| ![One window selected directly on its wall, with independent dimensions](docs/assets/screenshots/editor-model-window-instance-2026-09-26.png) | ![Model Review with Mark all as reviewed and remaining validation issues](docs/assets/screenshots/editor-model-bulk-review-2026-09-26.png) |

| Public actions beneath the photograph | Selected public building opened in the owner editor |
| --- | --- |
| ![Directions and place actions above photo credits and arrival options](docs/assets/screenshots/public-building-actions-2026-09-26.png) | ![Public-map selection carried into the general building editing card](docs/assets/screenshots/editor-public-building-handoff-2026-09-26.png) |

## Recent changes

- **Reference split:** keep Orbit or Edit surface beside a photograph on roomy desktops/tablets, with a remembered, keyboard-accessible divider and automatic narrow-screen fallback.
- **Expanded modelling:** draw exterior walls, wings and courtyards; edit arcs, Bézier edges and rounded outlines; create primitives and extruded profiles; edit vertices, edges and faces in the shared canvas.
- **Model files:** preview and import GLB/glTF, OBJ with MTL/textures, and STL. Export GLB, embedded glTF, OBJ packages or binary STL with explicit unit conversion.
- **Private authored assets:** immutable source documents, owner-scoped recovery, versioned save guards and reviewed publication preserve existing campus compatibility. New database migration 012 is required.
- **Animated globe:** gentle idle rotation and independently drifting decorative clouds, with separate controls and reduced-motion defaults.
- **Published models restored:** optional roof-text support preserves existing model fingerprints. All 395 published models pass compatibility checks; genuine geometry or detail changes still invalidate outdated models.
- **Individual windows:** click a generated or recorded window and edit it directly. Selection does not change saved geometry; the first change separates only that window in one undoable command. Deliberate row, group and pattern editing remains available.
- **Simpler model controls:** Orbit, Edit surface and Photo share the same draft. The structure toggle is icon-only, desktop properties have a fixed header and wider scrolling body, and editor opacity starts at 100%.
- **Public building handoff:** Editor opens the selected building’s general card, including after sign-in. Directions, Share, Copy link, Save and Report appear below the photo and above credits and arrival options.
- **Bulk model review:** Mark all as reviewed reviews eligible recorded walls in this building in one undoable action. Invalid geometry, missing evidence and unmatched walls remain listed for repair.

- **Dedicated model workspace:** one full-width **Edit model** button opens in 3D Orbit. The general building card keeps survey metadata, photographs and repair actions. A nested, searchable keyboard-accessible tree shares selection with the viewport and properties.
- **Editing directly on surfaces:** **Edit surface** aligns the existing 3D canvas to walls, roofs or footprints. Wall handles, roof points/ridges and footprint vertices reuse precision-editing commands. Orbit restores the camera. Edit surface automatically falls back to a 2D drawing when WebGL is unavailable, retaining the same tools and numeric fields.
- **Building lettering:** add and edit text on walls and roofs, with wording, size, colour, alignment and placement controls. Roof text follows the actual roof planes. **Ungroup** and **Detach instance** are available in selected-item actions. All use existing undo and draft persistence; publication remains a separate reviewed action.

- **Canvas-first mobile modelling:** all five modes share a full-screen preview and one focused tool sheet. Tap selects; Move and Resize explicitly edit. **×** leaves the workspace and preserves unfinished work; **Done** closes only its tools. Short landscape screens put scrollable tools beside the canvas. Pinch navigation, multi-selection, held nudges and decimal inputs support precise editing. Desktop uses a collapsible tree, central viewport and properties panel.
- **Actions beside the selection:** the selected detail's ⋯ button, right-click and Shift+F10 open Duplicate, Copy, Paste/copy-to, Delete, Lock and Hide. Touch and hold a detail in **3D** to open the same menu; moving or adding a second finger cancels a pending hold. Keyboard shortcuts and placement previews support quick editing with Ungroup and Detach instance also shown when applicable.
- **Height that changes the model:** whole-building metres and floor count are editable inside Appearance. Custom roof elevations adjust proportionally by default; owners can retain recorded elevations, fit an existing mismatch or explicitly remove a wing override. Height/roof adjustments share one undo action.

- **Unified building editing:** Details, Appearance, Roof, Outline and Review share one draft and history. Use metre-based placement, snapping, keyboard nudges, multi-selection, duplication, alignment, groups, patterns, presets and previewed copies between walls/buildings. Completed actions autosave; unfinished values recover privately. Saving does not approve evidence or publish content. [Owner guide](docs/UNIFIED-MODEL-EDITOR.md).
- **Published photographic architecture:** the reviewed release contains 39 photographs covering 19 of 395 buildings. Roofs, colours and stable identities remain owner-managed. Dimensions and unseen sides remain estimates; there are no approved photographic wall textures in this release. [Evidence and coverage](docs/PHOTO-MODELS.md).
- **Illustrated offline globe:** the campus palette leads, with faint September 2004 NASA relief, Natural Earth geography and restrained atmosphere. It fades into the campus map and includes every required overview asset offline. [Attribution](data/ATTRIBUTION.md).
- **Visual photo management:** multiple uploads, per-file retry, author/external-source review, cover ordering, private drafts and public-gallery previews. Uploads continue while the app session remains open; Pause finishes the active file. Galleries use 20-item pages and IndexedDB recovery. [Photo workflow](docs/ARRIVAL-GUIDES.md).
- **Responsive and recoverable editing:** revision-aware indexes, bounded workers, geometry-independent metadata updates, committed-action model regeneration, resource disposal and explicit retry. The active map opens after campus verification while remaining offline assets are audited. [Current model measurements](docs/MODEL-EDITOR-VERIFICATION.md) · [Photo and app performance](docs/PERFORMANCE.md).

Application deployment leaves the published campus unchanged. New photos, models, permissions and routing changes use the owner preview, publication and rollback workflow.

Release review names each pending building/wall approval before a preview is queued. Editing details resets the affected wall's review, even if its layout still looks correct. **Review model** opens that assignment and **Inspect details and evidence** exposes its review controls. Approve an inspected wall individually, or use **Mark all as reviewed** in Model Review after inspecting the building; ineligible walls remain unresolved. **Restore published building** previews an undoable restoration of one building correction when its current draft should be discarded.

## Features

| Area | Current behavior |
| --- | --- |
| Exploration | Bottom search dock, local place search, categories, aliases, saved/recent places, provenance and recorded street names. |
| Map controls and panels | Adjustable mobile/desktop cards and dialogs; full-height desktop opening; pinned navigation; view/compass controls on the left and zoom/location on the right. |
| World overview | Illustrated campus palette with subtle September 2004 NASA relief, gentle atmosphere, Natural Earth coastlines/lakes/borders, offline labels and a return-to-campus action. |
| App updates | Visible update-ready notice, explicit installation, foreground/online checks and navigation safeguards. |
| Driving directions | Offline campus drive-and-walk journeys, vehicle permissions and one-way roads, turn restrictions, estimated ETA, parking selection, voice guidance, and a confirmed parking-to-walking handoff. Private roads and parking require separate owner driving review. |
| Walking directions | Worker-based A* routing, the shortest permitted walk and up to two sufficiently different alternatives when available. Recorded steps are shown; missing data stays unknown. |
| Navigation | Foreground GPS, natural offline British English voice, balanced turn timing, close-turn combinations, mapped names, remaining distance/ETA, route following, sustained-deviation rerouting and three-fix arrival confirmation. |
| Entrance guides | Best mapped entrance by default, optional explicit connected entrance, recorded approach/restriction/accessibility facts and a guide available during navigation and arrival. |
| Building photographs | Shared occupant galleries, entrance-specific photos and offline credits; a visual owner workspace handles multiple uploads, guided rights review, ordering and private recovery. All approved photos are downloaded. |
| Destination sharing | Copy a stable place link with an optional entrance ID or use native sharing; published aliases resolve old IDs and missing destinations offer a search fallback. |
| Appearance | Shared Device/Light/Dark settings in the public map and editor, a single opposite-action 2D/3D button, Enhanced by default and a remembered Simple option. |
| Enhanced buildings | Modeled walls, windows, trim, wings and roofs; original material colours in both themes, with automatic detail levels and simple fallback. |
| Owner editing | Autosave, grouped undo/redo, controlled automatic crossings and explicit joins, selection framing, publication-relative drafts, recoverable drawings/roof plans, guided repairs and conflicts. |
| Building editing | Shared surface editing with automatic 2D fallback; nested structure tree; wall/roof text; inherited styles; details, grouping, patterns and presets; targeted review and recoverable autosave. |
| Offline | Verified, resumable package downloads, explicit updates, integrity repair, prepared owner workspaces and immediate local recovery exports. |
| Data maintenance | Source comparison, reference/roof proposals, validation, release-impact and route checks, immutable preview/publish/rollback. |
| Reports and surveys | Private student reports with local offline drafts; owner-only walking surveys, entrance markers, touch review and recoverable private sync. |

Cycling, indoor positioning, current campus satellite imagery, background navigation, public user accounts and public user reviews are outside this release.

## Quick start

Use **Node.js 22.13+ within the 22.x line**, npm, Git and a WebGL-capable browser. Python 3.12+ is needed for importer scripts and their tests.

```sh
git clone https://github.com/mrglasswillbreak/TurnRight.git
cd TurnRight/web
npm ci
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173](http://localhost:5173). The bundled seed supports public exploration and route previews without API keys. The production campus can have newer owner-published corrections and models than this development seed.

To test the production PWA locally:

```sh
npm run build
npm run check:configured-build
npm run preview
```

Open [127.0.0.1:4173](http://127.0.0.1:4173), choose **Offline → Download campus map** and wait for readiness. Development mode does not provide the production service-worker lifecycle. Vite does not serve Vercel `/api` functions; connected administration and report submission require the configured hosted application. Browser tests supply isolated API fixtures.

## Using the public map

The public map opens with a compact search bar at the bottom. Tap the search field or the arrow to open Explore, Saved, Offline and Settings. On desktop, panels and dialogs open at full height and can then be shortened with their top handle. Navigation and map controls stay pinned above the panel’s scrolling content. On mobile, view and compass controls sit on the left of the map, with zoom and location controls on the right. Drag the handle at the top of a card or dialog to change its height. Your chosen mobile heights are remembered on this device. With a keyboard, focus the handle and use Up/Down, Home or End. Collapse the card to see more of the map, including during a walk.

Zoom out with the minus button or a pinch/scroll gesture to reveal the globe. Drag to explore and use **Back to campus**, the **LASU Ojo** marker or a campus search result to return. The globe works with either 2D/3D preference; detailed buildings return at campus zoom. **Follow me** restores walking zoom after globe exploration without ending an active route. World geography is an overview only: place search, streets and walking directions remain limited to the downloaded campus.

After **Find my location**, the globe retains your live position and, when sensors are enabled, approximate phone-facing direction as you move or turn. Manual globe exploration stays under your control. A stale fix becomes **Last known location**, and stale direction indicators disappear. GPS travel direction remains separate from the compass; location and sensor permissions remain optional.

When a new app version is ready, a notice appears over the public map with an **Install update** button. Updates are checked while the app is visible and when you return online. Installation waits until you finish navigation. You can also install from Settings.

1. Search for a building, faculty or service, or narrow the map with a category.
2. Open its details to check provenance, photographs, entrances and route coverage. Save, share or report the place.
3. Choose **Directions**, Walking or Driving + walking, and a current-location or manual origin. Review the destination entrance, any parking choice, alternatives and connection notices.
4. Start the available journey, allow location/audio and keep the application visible. Use mute, repeat, the instruction list and **Follow me** as needed. Driving requires a confirmed parking-to-walking handoff.

Voice directions use complete prerecorded sentences. Advance warnings adapt to recent walking speed (30–60 m); immediate turns need good location accuracy. Consecutive turns within 25 m are combined. Repeat describes the current state, including GPS loss or arrival. Muting, stopping and backgrounding cancel speech. New or renamed places without a recording keep their visible names and receive generic speech. **Settings → Preview voice directions** plays a sample outside navigation.

Poor or stale GPS pauses maneuver progression. Changing paths can trigger rerouting after sustained deviation with a sufficiently accurate fix; a nearby parallel path may remain inside the GPS tolerance and does not guarantee an immediate switch. The current rule needs eight seconds off-route, accuracy of 35 m or better, and at least 15 seconds between recalculations. Guidance ends at the mapped endpoint, which may be a nearby approach rather than an entrance. [Routing thresholds and limitations](docs/EDITOR.md).

Optional compass and motion assistance provides Travel-up, North-up and Phone-up orientation with GPS fallback. The purple cone is phone direction; the blue arrow is travel direction. Permissions are optional and can be retried from Settings. Motion hints are advisory: there is no step counting, dead reckoning or background navigation. Raw sensor readings remain in memory. [Sensor behavior and device checks](docs/MOTION.md).

## Driving on campus

Choose **Directions → Travel mode → Driving + walking**. Select a starting place or your current location, then use the suggested parking/drop-off point or choose another mapped point. Purple shows the driving leg; blue shows the walking leg. Total journey estimates combine both legs and do not include live traffic, parking search, or occupancy.

Keep the app visible. At the mapped vehicle endpoint, stop and park, then choose **Parked—start walking**. Driving reroutes retain the chosen parking point. The app never substitutes walking permission for vehicle access or draws an assumed connection across an unmapped gap.

The bundled map includes source-derived vehicle rules, but private campus roads and parking connections await owner driving review. An unavailable driving journey is expected until permitted roads, gates, parking and walking links are connected and published. Existing walking-only packages continue to work; update the campus package to obtain driving data. [Driving data, owner workflow and verification](docs/DRIVING.md).

## Entrance guides and photographs

Open a destination's **Building photographs** and **Entrances & arrival** sections. Galleries show distinct reviewed views, captions, historical labels, recorded capture dates and source-check dates. **Photo credits & license** contains the author, original source, reuse license and modification notices. Occupants share their building's photographs without downloading duplicate assets; a general building photograph does not identify every occupant's doorway.

**Destination entrance** defaults to **Best mapped entrance**. Where permitted, connected entrances exist, choose one explicitly. That choice survives alternatives, rerouting and driving-to-walking transitions. A closed, missing or disconnected selection requires another choice. Shared links can include `entrance=<stable-id>`; existing place-only links continue to work.

The map distinguishes connected entrances, unconfirmed connections and mapped approaches. **Mapped approach …; final entrance not verified** means the route ends on a mapped path near the destination. It does not confirm a doorway connection. Recorded steps, ramps, surfaces and measured doorway widths remain observations, with unknown details left unknown; no accessible-route guarantee is implied.

The building inspector shows its gallery preview and **Manage photos** button at the top. Owners edit arrival guides separately from this photo workspace. Add multiple files, review large previews, choose **I took this photo** or an external source, arrange the cover and gallery, and recover unfinished work in **Private uploads**. Reviewed photos attach to the map draft in an undoable batch; public-gallery preview and release publication remain separate. Original uploads and reviewer records remain private. Published derivatives are metadata-free WebP files, at most 1,600 pixels on the longest side and 250 KiB each. Moving an entrance flags its guide and photographs for review. Photos never grant access or create routing connections. [Guide, media review and offline behavior](docs/ARRIVAL-GUIDES.md) · [Collection coverage and candidate decisions](data/photos/README.md).

## Appearance and 3D

**Settings → Appearance** is available in both the public map and owner editor:

| Option | Behavior |
| --- | --- |
| **Device** — default | Follows the device's light/dark preference and reacts to system changes. |
| **Light** | Keeps the interface and map light. |
| **Dark** | Uses dark panels, blue-grey terrain and streets, green vegetation and blue water. |

Explicit choices persist across reopening and synchronize between tabs on the same origin. Storage failure retains the choice for the current session and shows a message. Changing the theme keeps the mounted map, camera, selection, drawing and roof draft.

Entrance and mapped-approach popup text, background, pointer and close button follow the active theme, including while a popup is open.

The map has **one view button**: **3D** switches into 3D; **2D** returns to 2D. There is no attached chevron. **Settings → 3D rendering** offers Enhanced and Simple; Enhanced is the default and an existing saved Simple choice is respected. Editor Settings also provides live **Tilt** in 3D and **Building opacity**, initially 100%. Ground-editing tools temporarily expose the footprint.

Enhanced architecture retains its **original wall, window, roof and trim colours in both themes**, including older model packages and draft previews. Dark lighting adds neutral shading. Illustrative 2D footprints and Simple blocks use the slate palette. Material colour is separate from source evidence: a modeled detail is not necessarily a measured or photographed reconstruction.

Enhanced detail reduces at wider zooms and returns automatically on zooming in. Basic extrusions remain available where models are absent or unusable. Height evidence distinguishes measured/recorded heights, floor-based estimates and illustrative unknowns. [Rendering and dark styling](docs/DARK-MAP-STYLING.md).

## Owner editor

The [private editor](https://turnright.vercel.app/admin) requires the single allowlisted GitHub owner. Backend authorization and database policies protect drafts, reports, source proposals and releases.

- **Workspace:** select buildings, places, entrances or paths; edit properties, draw geometry, inspect mapping needs and test routes.
- **Sources:** compare imported records and their geometry, review reference-based appearance suggestions and inspect proposed roofs.
- **Settings:** change theme, 3D rendering, tilt and opacity without leaving unfinished work.
- **Reports and Releases:** review submitted issues and the release pipeline separately from live editing.

**Drafts** and map highlights show changes since the latest publication. Published corrections remain stored; editing them again creates a new pending change. Selecting an object animates it into view, and closing properties returns to the previous view. Mobile selection of a long path limits zoom-out to 0.75 levels; short paths and buildings still fit their complete geometry.

Drawn paths and surveys applied to the map draft participate in the editor’s routing checks when their walking access and connections are valid. Same-level intersections connect automatically unless disabled for a path. Use **Path connections → Connect crossings automatically**, **Crossing level**, or explicit endpoint/join controls to handle exceptions. Gaps, different levels, barriers, restrictions and closures are not bypassed. A reviewed campus publication makes accepted changes available to public navigation. [Connection controls](docs/EDITOR.md#control-automatic-connections).

Autosave preserves draft edits. A continuous field interaction is one undo step; blur, Enter, selection changes or another command finish the group. Undo restores related geometry, surface identities and styles together. Drawing gestures are protected against accidental tool changes, and unfinished work can be resumed after reopening.

Errors offer the failed operation's recovery, such as **Retry save**, **Retry export**, **Retry route**, **Retry 3D preview** or renewed sign-in. Save failures and other task errors remain separate. Reads have bounded timeouts; a prepared owner workspace can be offered after network failure even when the browser claims to be online.

Conflict review compares base, local and server values. Independent field/surface changes merge; conflicting values need an explicit choice. Geometry changes and dependent connections or surface assignments are reviewed together.

Guided repairs select the affected feature and open the relevant control. Proposed geometry is previewed before **Apply reviewed repair**. Opening **Duplicates** makes no edit: review survivors, removals and redirected entrances before applying one undoable batch. [Editor guide](docs/EDITOR.md) · [Reliability and conflict handling](docs/EDITOR-RELIABILITY.md).

## Building appearance and roofs

**Edit model** is the single entry from a selected building. The general card retains identification, survey metadata, photographs, validation notices and geometry repair. A read-only summary reports wings, height/floors and review status.

![The selected building card with its primary Edit model entry and gallery](docs/assets/screenshots/editor-building-current-2026-09-26.png)

The desktop workspace has a collapsible structure tree, centre viewport and contextual properties. Building and wing defaults are explicit; the tree contains footprints, roofs, exterior/courtyard walls, details, groups and patterns. Collection members reference the same detail records. Search reveals ancestors; arrows, Home/End, type-ahead, Enter and Space support keyboard selection without moving the camera.

![Orbit view with the nested model structure and selected detail properties](docs/assets/screenshots/editor-model-orbit-current-2026-09-26.png)

**Edit surface** aligns the same 3D canvas to the selected surface. Move/resize wall details, edit roof points and ridges, or adjust footprint and courtyard boundaries. Numeric fields remain available; there are no interior room/storey objects. **Orbit** restores the previous orbit position. **Edit surface** uses the same target, draft and commands in an automatic 2D fallback when WebGL is unavailable. Photo reference stays accessible.

| Wall lettering and details | Roof lettering on the model |
| --- | --- |
| ![Editable plain text on a building wall with metre-based position and size controls](docs/assets/screenshots/editor-model-wall-text-2026-09-26.png) | ![Roof text with wording, dimensions and rotation properties](docs/assets/screenshots/editor-model-roof-text-2026-09-26.png) |

Use **Add text** on a wall or **Add roof text** on a wing. Wording, colour, weight and alignment are editable. Wall lettering uses detail placement, repetition and grouping; roof lettering follows slopes, ridges and valleys. Roof labels must fit inside the wing and outside courtyard openings. These are saved model details, visible publicly only after the map is reviewed and published.

Selected details expose **Ungroup** for group membership and **Detach instance** for repeated windows or other details. The action menu retains Duplicate, Copy, Paste/copy-to, Delete, Lock and Hide. Detail multiselection remains limited to one wall.

![Selected-item actions beside the model, with group membership represented in the tree](docs/assets/screenshots/editor-model-tree-actions-2026-09-26.png)

On phones, use the mode selector and **Orbit / Edit surface / Photo** views. **Choose wall**, **Add**, **Edit** and **More** open one panel at a time. Portrait keeps focused sheets; landscape places a panel beside the canvas at about 40% width, capped at 320 CSS px. Headers and close controls remain accessible, forms scroll inside the panel, and rotation preserves entered values and selection. Tap selects; Move and Resize explicitly enable touch editing. A second touch cancels an unfinished gesture before navigation.

![Landscape editing with a visible model and scrollable properties](docs/assets/screenshots/editor-model-landscape-2026-09-26.png)

Select the building row and **Appearance → Building height** to edit whole-building metres or recorded floor counts. Floor-count mode uses a labelled 3 m-per-floor estimate. Custom roof elevations adjust proportionally by default; owners can retain recorded elevations, fit an existing mismatch or explicitly remove a wing override. Missing values remain recoverable input rather than invented dimensions.

Completed gestures and field edits create undoable commands. Autosave, validation, recovery and review use the existing workspace. Invalid candidates do not replace valid saved geometry. **Back to Survey** leaves the desktop workspace; the phone **×** control retains unfinished work. A model save does not publish the campus.

[Complete model controls and recovery](docs/UNIFIED-MODEL-EDITOR.md) · [Roofs and geometry](docs/BUILDING-ROOFS.md) · [Evidence and texture coverage](docs/PHOTO-MODELS.md) · [Verification](docs/MODEL-EDITOR-VERIFICATION.md).

## Reference editing and authored models

Enable **Reference split** to keep a photograph beside Orbit or Edit surface. The divider and preference are remembered; small viewports return to tabs automatically without discarding edits or replacing the renderer.

![Reference photograph beside the model viewport](docs/assets/screenshots/reference-editing-2026-09-26.png)

**Outline → Add wall** creates replacement exterior boundaries, wings and courtyards. Arcs, Bézier edges, rounded corners and circular/elliptical outlines retain editable controls and logical wall identities. Curved-wall details use distance along the wall, with section-aligned editing.

| Curved exterior boundary | Adding a courtyard boundary |
| --- | --- |
| ![Curved wall controls and model outline](docs/assets/screenshots/curved-wall-outline-2026-09-26.png) | ![Add wall with an elliptical courtyard preview](docs/assets/screenshots/add-wall-courtyard-2026-09-26.png) |

**Mesh** adds primitives, editable extruded profiles and Object/Vertex/Edge/Face selection. Move, rotate, scale, extrude, inset, subdivide, merge, duplicate and delete through shared undoable commands. A native building needs an explicit editable mesh copy; the source remains intact. Numeric tools, axis constraints and snapping complement on-model handles.

| Face editing in the shared model canvas | Import preview and conversion |
| --- | --- |
| ![Face selection, extrusion and mesh properties](docs/assets/screenshots/mesh-editing-2026-09-26.png) | ![Model import preview with dimensions, units and up-axis controls](docs/assets/screenshots/model-import-preview-2026-09-26.png) |

Import GLB/glTF, OBJ with supplied MTL/textures, or STL in cancellable workers. Export a whole building or selected objects as GLB, embedded glTF, an OBJ/MTL/texture ZIP, or binary STL. Unsupported features and missing dependencies are reported before commit. Private source assets, offline recovery and review gates protect unfinished work; publication alone exposes authored content. Geographic footprints remain authoritative for routing. See the [complete authoring guide](docs/MODEL-AUTHORING.md) for workflows, file compatibility and complexity limits.

| Orbit with authored geometry | Export units and format |
| --- | --- |
| ![Authored object in Orbit with mesh editing tools](docs/assets/screenshots/mesh-orbit-2026-09-26.png) | ![Export preparation and format options](docs/assets/screenshots/model-export-2026-09-26.png) |

At globe scale, separate controls enable gentle automatic rotation and decorative drifting clouds. Interaction, selection, guidance and location following pause rotation; it resumes after eight eligible idle seconds. Reduced-motion preferences disable rotation and keep clouds static by default.

![Globe with decorative cloud layer and independent animation controls](docs/assets/screenshots/animated-globe-2026-09-26.png)

## Review and publication

![Release review identifies unresolved model assignments before publication](docs/assets/screenshots/editor-releases-current-2026-09-26.png)

**Saving a draft and deploying application code do not publish campus changes.**

1. Import source candidates with **Check now** or the scheduled source job. Incomplete imports retain the last successful source set.
2. Compare property rows and before/after geometry; raw records remain under Details. Review baseline reconciliation when approved sources differ from a published baseline.
3. Resolve blocking validation issues and inspect release impact: added/changed/deleted features, entrance and connectivity changes, and Clinic–Senate, Clinic–Law and Clinic–Library route results.
4. Resolve any **Model release blockers** first. The panel names the building, wing and wall; **Review model** opens the affected assignment. Height or roof changes can require another placement review without changing the wall match. Then **Build review preview** flushes pending saves and creates an immutable release snapshot. The release worker independently validates it and regenerates the visual catalogue/sectors with the same building and roof rules as the editor.
5. Review the hosted preview, then use the owner's **Publish** action. Publication is recorded only after deployment/promotion succeeds. Keep the previous release for rollback.

Job status refreshes while its review panel is open. Publication and job submissions are checked before repetition; a failed action is not treated as published. Closures remain active until explicitly reopened and republished; an expected reopening date is only a review flag.

| Workflow | Purpose |
| --- | --- |
| `source-update.yml` | Daily/on-demand source import and comparison |
| `release.yml` | Reviewed preview, publication and rollback |
| `preview.yml` | Manual seed-based preview deployment |
| `bootstrap.yml` | Initial accepted source baseline without overwriting an existing baseline |

For campus enrichment, install `scripts/requirements-data.txt` in an isolated Python environment and run `python scripts/enrich_campus.py` from the repository root. It produces a review candidate, source receipts, coverage ledger and transportation comparison using OSM, permitted LASU ArcGIS data and bounded Overture extracts. Streets, restaurant/business details, multilingual aliases and addresses are searchable offline. See [enrichment and review](docs/ENRICHMENT.md). `node scripts/package.mjs` builds the seed package for development. Neither replaces the reviewed production release workflow.

## Walking surveys

![Survey workspace with recording and review controls](docs/assets/screenshots/editor-survey-current-2026-09-26.png)

On an owner phone session, choose **Survey** and prepare it online before a field visit. The workflow is **record → mark entrances → finish → adjust/connect → save survey → apply to map draft**.

Recording uses foreground GPS in north-up 2D. Pause/resume is explicit; backgrounding or reopening requires Resume. Stale fixes, implausible jumps and poor accuracy are excluded. Gaps remain separate sections. Entrance placement pauses for a deliberate building/place association.

Review supports trimming, splitting, vertex movement and explicit endpoint connections. Correcting an existing path retains geometry outside the selected section and preserves boundary junctions and metadata. Paths crossing at the same level connect automatically. Each path has **Connect crossings automatically** and **Crossing level** controls; bridges, tunnels, restrictions and missing gate spans remain separate where appropriate. See [connection controls](docs/EDITOR.md#control-automatic-connections).

Local recordings are owner-scoped and recoverable. Private sync preserves conflicting versions for review; raw sample tracks and timestamps are excluded from public packages. Field verification on physical Android and iPhone remains outstanding. [Survey guide and field record](docs/SURVEY.md).

## Offline operation and recovery

An initial online visit and a completed download are required. Installation and download are separate: use the browser's install/Add to Home Screen action, then download the campus package.

| Content | Storage / behavior |
| --- | --- |
| App shell, UI, fonts, map/model/routing workers, world overview and natural voice | Service-worker precache; world data and natural audio are included automatically |
| Campus geometry, routing, arrival guides, approved photographs and credits, glyphs, legacy fallback audio, visual catalogue and model sectors | Size/hash-verified CacheStorage assets with IndexedDB package records |
| Preferences, saved places, private editor/survey recovery and report drafts | Local browser storage, scoped where appropriate |

The natural voice pack is saved automatically with the **app**, independently of the campus download, with an 8 MiB total budget. Ordinary deployments reuse its checked-in recordings; no speech model runs on a phone. Existing campus-packaged recordings remain available as a fallback. Finish saving the app **and** downloading the campus map before disconnecting.

The world overview adds **about 5.30 MiB**, including 341 local 512-pixel raster tiles at zooms 0–4 and Natural Earth vectors. It uses the bundled label font. World assets are hash-verified before a new service worker activates; a failed installation keeps the working app. Wait for **Ready offline** before disconnecting; no external tiles or fonts are needed to explore the saved globe. A failed world-data load leaves the campus usable and offers **Retry world map**.

Downloads are resumable and activate atomically after integrity checks. Interrupted or corrupt updates retain the working package and can reuse valid assets. **Offline** shows the actual downloaded version, coverage and model readiness. A known newer map requires an explicit download; it waits to activate during navigation. The public **App update ready** notice and **Settings → Install update** activate a waiting application update with editing/navigation safeguards. App-update checks run once a minute while visible and online, and on returning to the app or reconnecting. Installing remains an explicit action; it is disabled during an active walk.

The campus download includes **every approved release photograph** and its required credits. Photo totals above 20 MiB produce a size warning, not silent omissions. Every required asset must verify before activation; integrity repair and immutable older assets support recovery and rollback. Older packages remain readable with absent guides and galleries omitted.

**Download local recovery** immediately exports the owner workspace without waiting for the server, including pending edits, unfinished geometry/roof work, undo history, save receipts and baseline information. Full server backup export is a separate online operation. Prepare an owner workspace online before relying on offline reopening.

Storage can be evicted or unavailable. Keep recovery exports for important work; do not clear site storage while unsynchronized work is pending. Offline reports remain drafts until explicitly submitted. Offline closures are only as current as the downloaded package.

## Map data and coverage

![Source review and baseline information in the owner editor](docs/assets/screenshots/editor-sources-current-2026-09-26.png)

TurnRight combines OpenStreetMap and permitted LASU ArcGIS layers with reviewed owner corrections. Source IDs, access tags and provenance remain available. The world overview uses the fixed September 2004 NASA Blue Marble shaded-topography composite (about 2 km per original pixel at the equator) and public-domain Natural Earth v5.1.2 at 1:50m scale. It does not add worldwide roads, current campus imagery or routing coverage. Tiles are bundled locally. [Sources, dates, checksums and credits](data/world-sources.json).

The reviewed public release verified on **26 September 2026** is **`lasu-7343cb96c9a5`**, containing **395 buildings, 220 places and 39 photographs**, with **84 assets / 20,228,832 bytes**. Its release summary is “Roofing detail additions and map building clean up”. The earlier photographic assessment used `lasu-623791e1184e`. That earlier release added the 19-building photographic assessment to the previous `lasu-8577d5c85d2c` baseline; feature identities, footprints, photographs, routing graph and access permissions are unchanged. The [coverage report](docs/PHOTO-MODEL-COVERAGE.md) records comparisons against that previous baseline. The live/downloaded version can advance independently; the app's Offline screen is authoritative for the user's installed package.

Seed coverage is a reproducible baseline, not a claim about later owner releases:

| Seed metric | Value |
| --- | --- |
| Source place records, including duplicates | 219 |
| Places with a mapped approach | 206 |
| Approaches on the largest path component | 201 |
| Places without an approach | 13 |
| Confirmed connected entrances | 0 |
| Walking graph components | 5 |
| Campus field verification | Pending |

A mapped approach uses existing paths near the destination, without inventing the final connection. Reviewed student-access corrections permit specified internal roads, the Faculty of Law driveway and International Library gate; other restrictions, barriers, parking aisles and closures remain in force. Visual appearance changes do not modify routing.

The initial photograph inventory covered all 420 buildings in that source snapshot and accounts for all **7,976 records** discovered in its documented snapshots: **21 included, 167 duplicate, 7,725 rejected and 63 awaiting evidence or permission**. These are source-record counts, not a claim to have found every photograph online. Uncertain building matches, unlicensed material and declared synthetic imagery are excluded. [Reproducible inventory and coverage](data/photos/README.md).

The roof assessment covered 380 footprints and proposed 46 wing roofs across 44 buildings; most are illustrative, with photographic support for three building forms. This is a dated assessment, not a guarantee that every building has an accurate model. [Coverage and access](docs/CAMPUS-ACCESS.md) · [Machine-readable seed coverage](data/coverage-report.json) · [Roof coverage](docs/BUILDING-ROOF-COVERAGE.md).

## Architecture

| Layer | Technology / responsibility |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, Tailwind CSS 4, shadcn/Base UI |
| Map and geometry | MapLibre GL JS 6; packaged GeoJSON, Terra Draw and explicit graph connections |
| Architecture rendering | Three.js in the shared WebGL context; sector loading, material caching, detail levels and fallback |
| Model workspace | One mounted Three.js scene; perspective Orbit and orthographic surface views; shared gestures, selection, tree and undo commands |
| Building generation | Shared worker/release mesh rules; Delaunator with Constrainautor for custom roofs |
| Routing | Dedicated worker, A* and bounded alternatives |
| Offline | Workbox, `vite-plugin-pwa`, IndexedDB and CacheStorage |
| Audio and sensors | Packaged Web Audio clips, optional local speech, foreground GPS and optional motion/orientation |
| Administration | Supabase Auth/PostgreSQL/PostGIS, RLS and single-owner API authorization |
| Hosting/jobs | Vercel application/API; GitHub Actions with Python and Node scripts |

```mermaid
flowchart LR
    Sources[Recorded map sources] --> Import[Import and compare]
    Import --> Editor[Owner review and draft edits]
    Editor --> Snapshot[Validate immutable snapshot]
    Snapshot --> Preview[Build map and models / preview]
    Preview --> Publish[Owner publishes release]
    Publish --> App[Public app and verified offline package]
    App --> Device[Local search / routing / GPS / audio]
    Reports[Private reports and surveys] --> Editor
```

Published navigation does not require the admin database to be available. Model appearance and optional recovery fields use existing JSON properties; source geometry and routing remain separate from display classifications. [Architecture details](docs/ARCHITECTURE.md).

## Configuration and hosting

Public seed exploration requires no credentials. Connected administration/reports need [web/.env.example](web/.env.example), Supabase GitHub OAuth, the owner allowlist, database migrations and workflow configuration.

The unified model editor adds no migration or public package schema. Deploy its compatible authoring-metadata validation before dependent clients. For a new installation, apply the existing migrations in order through **[011_linear_baseline_reconciliation.sql](supabase/migrations/011_linear_baseline_reconciliation.sql)**. Migration [007](supabase/migrations/007_source_field_reviews.sql) adds field-level source reviews; [008](supabase/migrations/008_private_building_media.sql) adds private building media storage and owner-only metadata; [009](supabase/migrations/009_bounded_baseline_comparison.sql) bounds source comparisons and writes only changed baseline rows while retaining authorization, stale-review checks and rollback records. Migration [011](supabase/migrations/011_linear_baseline_reconciliation.sql) materializes parsed RPC inputs and further bounds baseline comparisons under cached plans, reuses the verified snapshot for rollback, and keeps authorization and scopes a 15-second budget to this owner-only bulk operation. Migration [010](supabase/migrations/010_private_photo_drafts.sql) adds private photo drafts, original filenames, target associations and guarded revisions while preserving immutable approvals. Author-uploaded photographs may omit a source website; releases containing them use package schema 3. Deploy compatible readers before publishing schema-3 content; schemas 1 and 2 remain readable. Follow the deployment guide's base setup and the production record.

| Variables | Scope |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser-visible authentication URL and public key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USER_ID` | Server-only database access and owner identity |
| `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_TOKEN` | Server-side workflow dispatch |
| `REPORT_RATE_SALT` | Server-only report rate-limit buckets |
| `SOURCE_REDISTRIBUTION_APPROVED` | Build-time source-rights gate |
| `PUBLISHED_MAP_URL` | Stable HTTPS origin whose approved package ordinary app builds preserve |

Do not put privileged keys in `VITE_` variables or commit real environment files. Additional GitHub Actions deployment secrets are listed in [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Vercel uses **`web` as the project root**, **Node 22**, **`npm run build`** and **`dist`** output, with repository files outside the root available. Main-branch code changes deploy the application. `PUBLISHED_MAP_URL` fetches and verifies the currently published package so a UI deployment cannot silently revert it to the seed; failure stops the build. Owner-reviewed releases use their immutable snapshot instead.

The project is configured on Vercel Hobby and Supabase Free. Hosting quotas or paused backend services can interrupt connected operations; already downloaded navigation remains local. See [configuration](docs/CONFIGURATION.md) and [production history](docs/PRODUCTION.md).

## Development and verification

Run from `web/`:

```sh
npm test
npm run lint
npm run build
npx playwright install chromium webkit
npm run test:browser
npm run test:survey-webkit
npm run test:survey-pwa
```

`lint` includes client/server TypeScript checks. The production build includes the PWA and existing visual budgets: **300 KiB gzip for the lazy renderer and model workspace**, **12 MiB for campus geometry and textures**, **8 MiB for globe assets**, and **8 MiB for natural voice**. Separate startup budgets cover public, owner and photo-management code. `check:configured-build` repeats these checks with dummy authentication configuration to retain the production auth dependencies; its output is a measurement fixture and must not be deployed. The build verifies lazy editor/world/voice precache inclusion and voice recording hashes. The WebKit and PWA scripts retain their historical survey names but also cover editor/building workflows. Run browser projects sequentially on machines using software WebGL.

Focused model, camera and panel regressions:

```sh
npx vitest run tests/model-surface.test.ts tests/editor-camera.test.ts tests/public-panel.test.ts tests/world-map.test.ts tests/globe-models.test.ts
npx playwright test --grep "surface workspace|model workspace touch layouts|landscape model has reachable"
npx playwright test --config playwright.webkit.config.ts --grep "model workspace touch layouts|landscape model has reachable"
```

For the current UI acceptance checks, use the in-app browser with a production preview: open and resize desktop panels, scroll their pinned controls, check mobile card heights, select a long editor path in 2D/3D, and install a locally staged service-worker update. For the globe, also check both themes, 2D/3D, world rotation, polar/date-line views, return-to-campus framing and resuming location following. Download first, stop the preview server, then reload and inspect country labels offline. A development server alone does not exercise PWA updates.

Importer/access tests run from the repository root:

```sh
python -m unittest discover -s scripts/tests -v
```

Coverage includes source normalization, appearance persistence/storage failures, grouped undo, save receipts, concurrent field/surface edits, geometry identity, constrained roofs, editor/release parity, drawing/roof recovery, worker failure/stale replies, package integrity and offline reopening. Browser tests use real map/rendering libraries with isolated authentication, API and hardware fixtures. Enhanced zoom cases inspect actual shader material colours and draw calls, including legacy meshes and repeated theme/zoom changes.

Current results, five-run production benchmarks, build budgets and reproducible commands are recorded in [Model editor verification](docs/MODEL-EDITOR-VERIFICATION.md). Earlier voice, photo and globe measurements remain dated in their respective reports and in [Production](docs/PRODUCTION.md). This README no longer repeats obsolete test counts or superseded asset sizes.

Acceptance records separate automated/browser checks from unfinished physical work: Android/iPhone touch repairs, installation, airplane-mode reopening, outdoor GPS, campus walks, battery behavior and modest-phone performance. Do not interpret a software WebGL timing or emulated phone screenshot as a completed physical-device test.

## Repository structure

```text
TurnRight/
├── web/
│   ├── src/                 # Public UI, editor, map, buildings, routing and storage
│   │   ├── AppearanceSettings.tsx # Shared public/editor theme control
│   │   ├── PhotoModelWorkspace.tsx # Shared model editor and responsive panels
│   │   ├── ModelStructureTree.tsx # Accessible model hierarchy
│   │   ├── model-surface.tsx # Shared surface gesture/projection bridge
│   │   ├── campus-model-layer.ts # Enhanced rendering and model lifecycle
│   │   └── sw.ts            # Application service worker
│   ├── api/                 # Vercel admin and report endpoints
│   ├── server/              # Server-only validation and authorization
│   ├── tests/               # Unit, browser and offline regression coverage
│   ├── public/              # Development seed and packaged static assets
│   └── .env.example         # Configuration names without credentials
├── data/                    # Sources, visuals, reference/roof assessments and attribution
├── scripts/                 # Import, compare, validate, package and release jobs
├── supabase/migrations/     # Database schema, policies and reconciliation
├── .github/workflows/       # Source and release automation
└── docs/                    # Workflow guides, acceptance records and screenshots
```

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Models look like basic blocks | Check **Settings → 3D rendering → Enhanced**, then zoom closer. Inspect the model status or retry failed assets. Some footprints have no enhanced model. |
| Building colours look different in dark mode | Enhanced models retain saved colours with lighting/shadows; Simple blocks and 2D footprints use slate styling. Install a waiting app update if enhanced materials still appear slate. |
| Mapped-approach text is pale on a white popup in Dark mode | Install the available **app update** from the notice or Settings. Popup text and surfaces now follow the active theme; no campus-data update is required for this display fix. |
| Editor stays in the wrong theme | Use **Editor Settings → Appearance → Light/Dark**, or **Device** to resume automatic changes. |
| Height changes but a wing stays short | Check its explicit height/floor override and custom roof elevations in **Edit model → Appearance → Building height**. Enable roof adjustment or explicitly fit the inherited roofs; review affected details. |
| A roof preview is outdated | Use **Retry 3D preview** and inspect geometry/elevation errors. The last valid model and unfinished roof are retained. |
| A long selected path extends off-screen on a phone | This preserves local map detail by limiting zoom-out. Pan along the highlighted path or use the zoom-out control to see more. |
| Paths connect where they should stay separate | Turn off automatic crossings for that path or set the correct bridge/tunnel level. Use explicit joins for the connections you do want, then review and publish. |
| An app update is available | Finish navigation, then choose **Install update** from the map notice or Settings. Use Offline Maps separately for campus-data updates. |
| Draft changes are absent from the public map | Autosave stores a private draft. Review, validate, build a preview and publish through Releases; a code push alone does not publish it. |
| Publish/preview is unavailable | Resolve blocking validation or reconciliation issues, pending saves and conflicts. For a façade review error, use Releases → Review model, inspect the named wall and mark that wall reviewed; build a new preview afterward. Inspect job errors and the release state; do not repeat an uncertain submission blindly. |
| Save/export/routing failed | Use the operation-specific retry. Renew an expired session if requested. **Download local recovery** remains independent of server export. |
| No walking connection to a destination | Review the actual missing path/entrance or disconnected component. Do not create assumed shortcuts or remove access restrictions globally. |
| Offline reopening fails | Use a production PWA, finish preparation/download, verify readiness and use integrity repair. Preserve unsynced recovery before changing storage. |
| Location or compass is unavailable | Use HTTPS, allow the relevant permissions and keep the app visible. Manual origins and GPS-only operation remain available. |
| Survey has gaps or paused | Review accuracy and interruptions, then Resume explicitly. Rewalk missing sections; gaps are not automatically connected. |
| Local admin/report API fails | Vite does not host Vercel functions. Use a configured hosted environment and verify OAuth, variables and owner authorization. |

## Documentation

| Guide | Topics |
| --- | --- |
| [Editor](docs/EDITOR.md) / [Reliability](docs/EDITOR-RELIABILITY.md) | Drawing, connections, recovery, conflict and operation-specific errors |
| [Entrance guides](docs/ARRIVAL-GUIDES.md) / [Photograph collection](data/photos/README.md) | Entrance selection, accessibility observations, private media review, reusable image coverage and offline galleries |
| [Driving](docs/DRIVING.md) / [Campus enrichment](docs/ENRICHMENT.md) | Independent vehicle permissions, drive-and-walk journeys, imports, source evidence and review |
| [Unified model workflow](docs/UNIFIED-MODEL-EDITOR.md) / [Building editor](docs/BUILDING-EDITOR.md) | Precision tools, duplication, patterns, roofs/outlines, evidence, undo and recovery |
| [Model authoring](docs/MODEL-AUTHORING.md) | Photo reference split, walls/curves, mesh commands, file interchange, private assets and publication |
| [Model verification](docs/MODEL-EDITOR-VERIFICATION.md) / [Performance](docs/PERFORMANCE.md) | Current production measurements, regressions, resource budgets and unavailable device coverage |
| [Roof plans](docs/BUILDING-ROOFS.md) / [Roof coverage](docs/BUILDING-ROOF-COVERAGE.md) | Constraints, validation, approximate proposals and evidence |
| [Building references](docs/BUILDING-REFERENCE-RESEARCH.md) / [Appearance coverage](docs/BUILDING-APPEARANCE-COVERAGE.md) | Reference sources, uncertainty and facade assessments |
| [Dark map](docs/DARK-MAP-STYLING.md) / [UI readability](docs/DARK-MODE-READABILITY.md) | Palette, original enhanced materials, labels, controls and contrast |
| [Surveys](docs/SURVEY.md) / [Motion](docs/MOTION.md) | Recording, private evidence, permissions and field checks |
| [Architecture](docs/ARCHITECTURE.md) / [Miniature campus](docs/MINIATURE-CAMPUS.md) | Data boundaries, routing, storage and model packages |
| [Deployment](docs/DEPLOYMENT.md) / [Configuration](docs/CONFIGURATION.md) / [Production](docs/PRODUCTION.md) | Service setup and operational history |
| [Acceptance](docs/ACCEPTANCE.md) | Automated evidence and outstanding physical checks |
| [Campus access](docs/CAMPUS-ACCESS.md) / [Connection review](docs/CONNECTION-REVIEW.md) | Approved walking corrections and remaining gaps |
| [Offline voice](docs/VOICE.md) | Timing, recording provenance, regeneration, name coverage and device checks |
| [Attribution](data/ATTRIBUTION.md) / [Overture audit](docs/OVERTURE-COMPARISON.md) | Provenance, permissions and source comparisons |

## Contributing and licensing

Use GitHub issues for reproducible software defects or feature proposals; include browser/device, app/package version, steps and expected behavior. Use in-app reports for campus places and paths. Keep changes focused, run relevant checks and include screenshots for UI changes. Map contributions need identity, provenance, redistribution permission and evidence for connections/access. Mark unsurveyed details explicitly. Never commit credentials, private reports or raw owner recordings.

- **OpenStreetMap:** © OpenStreetMap contributors, ODbL 1.0. The package includes OSM-derived data. [Attribution and license](https://www.openstreetmap.org/copyright).
- **LASU ArcGIS:** MangroveandpartnersLimited. The owner recorded offline redistribution permission on 8 September 2026; the public item supplied no explicit redistribution license. That confirmation is recorded in [ATTRIBUTION.md](data/ATTRIBUTION.md), not a general grant for unrelated uses.
- **Fonts/audio:** Inter uses the SIL Open Font License; Open Sans map glyphs use Apache 2.0. Natural navigation recordings use locally generated Kokoro v1.0 `bf_emma` (Apache 2.0 model); original Windows recordings remain a fallback. Provenance and regeneration details are in the attribution record.
- **Reference images:** Linked evidence and supplied visual inspiration do not establish redistribution rights or surveyed building accuracy. The README contains application screenshots, not copied reference photography.
- **Published photographs:** The current researched collection uses CC BY-SA 4.0 images with verified building matches. Each gallery retains its source, author, license and derivative notices online and offline. Original authors retain copyright; see the [collection report](data/photos/README.md).

No standalone license has been selected for TurnRight's own source code. Do not assume an MIT or Apache license; dependencies and datasets retain their respective terms. No Google Maps content or remotely hosted rendered map tiles are bundled. The offline globe includes the dated NASA composite under its recorded reuse conditions; this is not current campus satellite coverage.
