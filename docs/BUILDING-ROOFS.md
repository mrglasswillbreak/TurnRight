# Editable campus roof plans

## Reference and boundary editing

Roof editing can run beside a photograph using Reference split. New walls, curved outlines and courtyards can invalidate a prior roof plan: repair and review the retained draft before publishing. Imported objects attach to the building without silently changing native roof parameters. See [expanded authoring](MODEL-AUTHORING.md).

The September 15, 2026 roof pass assessed all 380 published building footprints. After reviewing Law Clinic's separate-wing correction, it proposes **46 wing roofs across 44 buildings**: three buildings with photo-supported pitched forms (Law Clinic, School of Transport and Faculty of Education 3 In 1), plus 41 clearly labelled illustrative hip roofs. All generated ridge positions and pitches are approximate. Known flat/parapet silhouettes, explicit owner roof choices, existing custom roofs, unresolved competing models and unknown heights are retained. See [the full coverage list](BUILDING-ROOF-COVERAGE.md).

Law Clinic's geometry prerequisite regroups the existing coordinates into two exterior wings. It does not move vertices or change its identity or entrance associations. The auxiliary wing retains its visible palette and explicitly illustrative 6 m height. Its roof is not presented as a surveyed reconstruction.

## Editing

The mobile workspace supports surface-aligned roof editing in the main viewport, with automatic 2D fallback when WebGL is unavailable. Use **Edit roof** for controls, **Done** to close the sheet, and **Move point** after selecting a point. Panning or a second touch does not commit roof geometry. Desktop retains the integrated plan and properties panels.

Whole-building **Appearance → Building height** now offers proportional adjustment of inherited custom roofs. It scales eaves and all roof-point elevations together while retaining plan coordinates, constraints and detail dimensions. The option is on by default; turn it off to preserve recorded roof elevations. Wing height overrides remain explicit. Existing height/roof mismatches can be fitted by an owner action. This is an estimated transformation requiring review, not new measured evidence, and the complete change is one undoable command.

- Sources → Building roofs previews individual wing outlines, ridge plans, eaves and peak elevations, source links and uncertainty. The batch is explicit, validated, autosaved and one undo step. Opening the review makes no saved edit. The plans are calculated only after opening the section.
- In the unified **Roof** mode, choose a wing and create/edit its custom roof, or preview an approximate hip proposal. Completed valid point, elevation and ridge/valley actions autosave; invalid intermediate work stays local for repair. **Done editing roof** closes its controls. The separate Sources batch still requires its explicit reviewed apply action. Close the model workspace to reach map Settings; recovery retains unfinished work. See [current model workflow](UNIFIED-MODEL-EDITOR.md).
- The generator stores ordinary editable roof points, elevations and ridge constraints. It uses the existing constrained triangulation to keep concave footprints and courtyards intact. Four-sided wings receive a simple hip ridge; complex wings use interior triangle connections. These are illustrative ridge networks, not a surveyed roof plan or an exact straight skeleton.
- Eaves and peaks remain inside the existing total height. Invalid outlines, incompatible constraints, zero-area geometry and model/control-point budget failures block the proposal. Source geometry and routing are unchanged by the roof batch.

![Roof controls over the rendered roof](assets/screenshots/editor-roof-current-2026-09-26.png)

**Edit surface** aligns above the selected wing. The same renderer stays mounted while the existing roof controller supplies points, ridges and valleys. Plan dragging changes horizontal position; metre fields edit elevation. **Edit surface** automatically uses a 2D drawing if WebGL is unavailable, retaining the same draft and precision controls. Orbit restores the prior camera.

**Add roof text** places editable plain text on that wing. Wording, dimensions, colour, alignment and rotation are properties; drag its outline or enter coordinates to move it. Labels are clipped to the actual roof triangles, following ridges and valleys. Labels must fit within the footprint and avoid courtyards; invalid edits retain valid saved geometry. No new roof/storey/room objects are introduced.

![Roof lettering properties and placement](assets/screenshots/editor-model-roof-text-2026-09-26.png)

## Generation and validation

The editor and immutable release use the same custom-roof mesher. A custom roof no longer triggers the obsolete complex-pitched-roof downgrade, which hid facade windows during publication. Roof evidence notes travel with recovery and the published catalogue.

Candidate verification: 57 enhanced models across 23 sectors, **938,421 bytes** of model sectors. Every candidate release model matches editor geometry and materials exactly. The 46 proposed wing roofs have nonzero slopes. The original public package had zero sloped enhanced roofs.

Automated coverage includes concave wings, courtyards, invalid ring grouping, invalid heights, point budgets, whole-wing movement, preserved owner styles and roofs, reference mismatches, single-step batch undo/redo, recovery, and editor/release geometry parity. Chromium desktop/phone checks cover review, saving, reload and dark-mode readability; Chromium also covers unfinished roof recovery through Settings and view changes and full-campus regeneration. WebKit phone checks cover review, save, undo/redo and reload. Physical Android/iPhone touch and offline acceptance remain outstanding.

The application update may be deployed independently. Campus roof changes remain in the owner's reviewed draft/release workflow; public publication requires the owner's Publish action.
