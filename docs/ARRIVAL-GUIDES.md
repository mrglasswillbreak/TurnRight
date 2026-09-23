# Entrance guides and building photographs

The public map shares general building photographs across its linked occupants.
Doorway photographs belong to a specific entrance. A photograph never establishes
an entrance connection, access approval, step-free route or permission to drive.

## Using the map

Open a destination's **Building photographs** and **Entrances & arrival** sections.
Captions, historical labels, source-check dates, author credits, license notices
and modification details remain available offline. Hours, access restrictions
and arrival observations describe recorded evidence, not current conditions.

Directions default to **Best mapped entrance**. An explicit permitted, connected
entrance stays selected through alternatives, rerouting and the parked-to-walking
transition. If it disappears or closes, choose another entrance; the app will not
silently substitute one. Shared links optionally contain `entrance=<stable-id>`;
older place links continue to work. The compact guide stays below navigation
controls and remains accessible at arrival.

Steps, ramps, surfaces and measured doorway widths are observations. Missing
information is displayed as unknown. A mapped approach is distinguished from a
confirmed entrance; this release adds no accessible-route guarantee.

## Owner review

Place and entrance inspectors edit approach instructions, restrictions, observed
accessibility facts, evidence and observation dates. Moving an entrance flags its
guide and entrance photographs for another review. Existing draft batches,
undo/redo, recovery and source reconciliation retain these optional fields.

Building and entrance inspectors import JPEG, PNG and WebP photographs up to
10 MiB. Originals and upload/reviewer records remain in the private
`building-media` bucket and owner-authorized `building_media` table. The server
rejects malformed, animated, oversized or unsupported images and creates a
metadata-free WebP at most 1,600 pixels on its longest side and 250 KiB.

Review the actual derivative, match, caption, alternative text, author, source,
redistribution license, credits and historical/capture dates before attachment.
Use **Recover private uploads** after an interruption; **Revise caption or match**
creates an immutable revision for an approved owner upload. General research
photographs also support caption/credit edits. Reorder or remove photographs in
the draft. Explicit owner galleries, including empty galleries, override the
research catalogue through building aliases and merges.

Apply migration `008_private_building_media.sql` before deploying the media API.
It was applied to the existing production project on 23 September 2026; the table
and private bucket were verified. It does not publish a map or grant public
access to originals. New installations apply migrations in order.

## Release and offline integrity

`data/photos/catalogue.json` contains reviewed reusable research derivatives.
The release worker combines these with owner-approved media, verifies every
required hash and size, validates associations and publishes immutable assets.
Public serialization excludes original paths, raw survey details and reviewer
identities. Required author credits and license notices remain public.

Every approved release photograph is included. Above 20 MiB, the interface warns
about download size; there is no aggregate photo cap or silent omission.
Interrupted or corrupt downloads cannot replace the working package. Repair
verifies cached bytes again; prior immutable package assets remain available for
rollback. Older packages remain readable with absent guides/galleries omitted.

## Collection and limits

See [the complete collection report](../data/photos/README.md), per-building
coverage and candidate decisions. Research covers the documented snapshots and
searches, not every photograph online. Rights or identity uncertainty stays in
the evidence queue. Google Maps photographs are excluded.

Tests cover explicit entrance failures, alternatives, driving/walking transitions,
sharing, multiple occupants, moved guides, private metadata, real derivative
processing, package integrity, interrupted photo downloads, repair and rollback.
Desktop/mobile browser journeys include keyboard gallery controls and offline
reloads. Browser simulations do not establish field-verified entrances.
