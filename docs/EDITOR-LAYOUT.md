# Editor layout contract

The shell is presentation state. It does not own map edits, renderer state, selections, undo commands, photo jobs or recovery. No server API or database migration is required for this redesign.

## Modules and identity

- `editor-layout.ts` defines `WorkspaceId`, `EditorSection`, `PaneId`, permitted defaults and versioned preference parsing.
- `WorkspaceFrame.tsx` owns the mounted centre canvas, resizable pane hosts and responsive sheet visibility. `WorkspacePane` portals content to a named host. Hiding a pane leaves its content mounted; workspace adapters retain their existing stores and callbacks.
- `WorkspaceNavigation.tsx` maps the five primary workspaces and their contextual sections. Legacy source/release views are accessible under Review/Publish.
- `EditorLegend.tsx` changes legend visibility only. `ProcessMonitor.tsx` combines existing process records and `PhotoQueueStore` status without creating duplicate photo jobs.
- `PhotoSession.tsx` owns queue startup, shutdown and blocking recovery registration. `PhotoActivity` is only its presentation. Closing Activity does not unmount the store or monitor.

The map stays in the same canvas position in the React tree across primary workspace changes. Model layout changes retain the existing model canvas and editor state. Photo panes retain the comparison canvas, recipes, worker jobs and local originals. Navigation guards for unfinished geometry and invalid/recovered model work remain authoritative.

## Preferences

The optional localStorage key is `turnright:layout:v1:<encoded-user>:<encoded-campus>`. Version 1 stores the last workspace, viewport-specific workspace choices, legend visibility, pane sizes, and collapsed flags. Pane scopes use `<workspace>:desktop` or `<workspace>:compact`; desktop begins at 1200 CSS px. The legend is shared across viewport classes for that user/campus. Invalid versions or malformed entries fall back safely; failures to read or write storage leave the session usable.

Model desktop sizes use the `model:desktop` scope. Photo panes use `photo:desktop`. Reset layout clears sizes and collapsed preferences and restores the legend, without modifying application data. Explicit building links and unfinished recovery take priority over the stored workspace.

## Validation

Run `npm test`, `npm run lint`, `npm run build`, and `npm run check:configured-build` in `web/`. The browser suite includes `workspace panes preserve the canvas, restore preferences and dismiss the legend`; `editor-layout.test.ts` covers storage isolation, validation, unavailable storage and permission defaults. Model/photo suites cover canvas identity, recovery, focused numeric input, undo and viewport changes. See [screenshot maintenance](SCREENSHOTS.md) for the reproducible visual fixtures and [acceptance](ACCEPTANCE.md) for offline and device gates.

[Redesign verification](REDESIGN-VERIFICATION.md) records this working tree’s measured gates and remaining physical-device limits.
