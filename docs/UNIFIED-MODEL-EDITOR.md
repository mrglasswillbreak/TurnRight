# Unified Photo & model editor

The building workspace brings architectural details, appearance, roofs, outlines and review into one draft. Open **Photo & model** from a building inspector, or use its **Appearance**, **Roof** or **Outline** shortcut. Linked place photographs still belong to their building.

## Choose a surface

Use the searchable building hierarchy or the mapped-wall selector to choose a wing and wall. The wall canvas is face-on: horizontal distances start at the labelled endpoint, and vertical distances are measured from the model base. The 3D preview provides geographic orientation. Selecting a surface or detail does not create a model-history entry.

Desktop panels can be resized. On a phone, switch between **Wall**, **3D** and **Photo** views; properties and the hierarchy remain available below the view. Fit-to-selection, reset and photograph zoom help with small details. Before/after comparison uses the building as it was when the workspace opened.

## Place and repeat details

Supported details are windows, doors, columns, balconies, canopies, parapets and trim. These are visual primitives. A decorative door does not create a mapped entrance, walking connection, accessibility observation or vehicle permission.

1. Use **Add window**, **Add door** or another detail button to insert it immediately. Existing generated windows and trim are preserved in the same undoable action. **Preview editable layout** remains available when you want to inspect conversion first.
2. Select a detail on the wall, from the hierarchy or in 3D. Shift-click and a marquee allow multiple selections.
3. Drag to move or use numeric position, dimensions and projection in metres. A resize handle is available for an individual detail.
4. Choose a 0.01, 0.1 or 1 metre grid. Arrow keys nudge by that increment; Shift multiplies it by ten. Alt temporarily bypasses snapping during a gesture. Floor guides are illustrative estimates.
5. Complete a drag or finish a numeric field to create one undoable command. Escape cancels the gesture or restores the field. An empty or incomplete numeric field remains editable and is never converted to zero.

Duplicate makes independent copies with fresh identities. Copy/paste and copy-to-wall/building show a placement preview. Physical dimensions are retained across walls of different lengths; repositioning or scaling requires an explicit action. Invalid placements are highlighted rather than silently clipped.

Groups, alignment, equal-gap distribution and horizontal mirroring work with selected details. Row/column patterns use explicit counts and metre spacing. Presets are named design copies; changing a preset does not update its earlier insertions. Hiding or locking a detail affects editing only, not the published model.

## Evidence and geometry changes

Illustrative details may be added without photographs and remain labelled as inferred. Observed details need a matching building photograph. Documented dimensions need measurement provenance. Copying a design to another building does not transfer photographic evidence or texture approval.

Use the photograph panel to compare the selected wall and align a texture with labelled corners. The original gallery image remains unchanged. Keep plain materials where the photograph does not establish an unobstructed, useful wall view.

Appearance controls retain building defaults and wing/wall overrides. Roof and outline modes use the existing geographic geometry and roof operations. Changing a footprint, wall length, roof or height can invalidate an assignment. Affected details remain available for placement review or rematching; they must not silently stretch onto a different wall.

**Appearance → Building height** edits the whole-building height, recorded floor count, approximate flag and source notes without leaving the workspace. These controls are separate from wing overrides. A missing floor count cannot be invented: enter the recorded value, or explicitly choose height in metres/unknown. Switching wall selectors keeps Appearance and Details on the same wall.

The **Review** mode lists changes and unresolved assignments. Review the selected wall explicitly. Saving a draft does not approve every wall, and model review does not establish field-surveyed accuracy.

## Saving, undo and recovery

Completed commands use the editor's shared 100-action undo/redo history, optimistic save identities and conflict handling. Selection, camera movement and panel changes remain outside model history.

Unfinished numeric fields and pending roof/detail work use owner-scoped local recovery. Closing the workspace preserves that work; **Discard unfinished input** removes the unfinished values. A local save is distinct from a server-confirmed map draft. Resolve storage errors or conflicts before relying on a remote save. Offline editing cannot upload changes until the connection returns.

If an addition cannot save because of a placement or building validation error, it stays visible as an unfinished wall and recovers when reopened. Resolve the reported issue, then choose **Save unfinished wall**. **Check building height** opens the relevant controls. Rejected appearance values remain with their original building and wall when switching selections; they are not silently cleared or applied elsewhere.

Map-draft saves share one atomic queue. An invalid change to another feature can leave the whole batch saved locally; the save error names that feature and its kind. Repair the named feature through the explorer. The server does not accept a partial batch while silently discarding its invalid changes.

Private authoring metadata stores names, groups, patterns and presets in the existing draft JSON. It is excluded from public campus downloads. Compatible server validation must deploy before the new client. Older editors receive an update message when they would otherwise drop this metadata. Public package schemas 1–3 and the database schema remain unchanged.

## Publication

Use the normal owner preview, validation, publication and rollback workflow. Draft autosave and application deployment do not publish architectural changes. Full publication validation remains authoritative, including geometry, evidence, asset integrity and existing walking/driving restrictions.

The workspace is lazy-loaded and included in prepared offline installations. The renderer retains batched materials, bounded texture loading, explicit disposal and the Simple 3D fallback. Continuous gestures update the editing canvas; completed actions request model regeneration, with one active request and only the newest pending request retained.
