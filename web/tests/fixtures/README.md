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
