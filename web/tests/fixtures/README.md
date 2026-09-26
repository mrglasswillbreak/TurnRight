# Live editor regression

`editor-2026-09-14.json.gz` contains the approved campus snapshot and correction
records exported through the owner editor on 14 September 2026 (local time).
Database actor identities and history are omitted; the complete export remains
in the owner's Downloads and ignored `web/work/editor-backup-2026-09-14.json`.
All correction geometry, access, steps, connections, deletion/undo receipts and
revisions are retained. The fresh export contains 10 active drafts, 20 total
correction records and 65 history entries, superseding the earlier UI count of 3.

Before the fix, empty edits reached final validation and reported one missing
endpoint. Applying all saved edits threw in `applyConnections` while calculating
distances (editor-topology.ts:148). Duplicate discovery alone succeeded.
The accepted baseline is `lasu-03bc96e56965` (153 nodes / 299 edges).
Edge `osm:way:1534765716:2297333149:2297333129:1` references missing sampled nodes
ending in `:10` and `:9`. The unpublished path join triggers the global distance
calculation that exposes that unrelated source defect.

## Public mobile search keyboard

Open `/tests/fixtures/keyboard-check.html` with the Vite development server
and a phone viewport. Focusing Search campus displays a 340 px simulated
keyboard and sends visual viewport resize/scroll events while the layout
viewport stays full size. The fixture is excluded from production builds.

Verified at 390 × 844 and 360 × 660: results remain above the keyboard,
scroll with the main navigation pinned, survive viewport panning, and open
on the first tap. Selecting a place dismisses the keyboard and restores the
normal card height. Collapse/reopen preserves that height. Also check the
public page at 390 × 450 for browsers that resize the layout viewport, and
at desktop size for the unchanged full-height adjustable card.

The desktop simulation does not replace a real iOS/Android keyboard check.

The keyboard fixture also treats result presses as touch input with real
pointer capture and drops the later compatibility click while the keyboard is
open. A completed tap must open the place details and blue map pin using the
release event. Dragging across a result must leave Search results open. The
result-tap unit tests cover cancelled gestures, long presses, multiple
fingers, duplicate clicks, mouse use and keyboard/screen-reader activation.

## Unified model workspace and documentation captures

The browser suite in `../browser/editor.spec.ts` supplies isolated owner, draft,
publication and media responses. Its model fixture covers shared 3D/2D commands,
wall and roof lettering, nested structure selection, individual generated and
repeated windows, grouping, instance locks/visibility, recovery, bulk wall review
and WebGL fallback. Public handoff cases cover linked and unlinked buildings,
sign-in return, unavailable targets and pending drawing protection. Arrival
tests assert actions appear between the photograph and its credits.
`model workspace touch layouts` simulates viewport rotation and
a reduced visual viewport while retaining an unfinished numeric field.

`playwright.docs.config.ts` builds the current application and combines isolated
owner responses with a verified copy of the published campus. Gallery edits stay
inside the test and never write production drafts. Follow the
[screenshot inventory](../../../docs/assets/screenshots/README.md) for capture
commands and provenance. These fixtures do not constitute real keyboard, GPS,
physical-phone or screen-reader acceptance.
