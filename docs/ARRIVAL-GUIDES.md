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

### Manage photos

Select a building or entrance and choose **Manage photos** below its thumbnail
strip. A linked place opens its building's gallery. The desktop dialog becomes a
full-screen workspace on mobile, with the gallery name and draft save status
kept visible.

- **Gallery:** edit details, make a photo the cover, move it earlier/later, or
  remove it from the draft. The first photograph is the cover. Removal offers
  **Undo removal**, and all gallery operations support the editor's undo/redo.
  Editing keeps the original position. Changing **Pictured building** or
  **Photograph of** moves the photo and updates affected galleries in one batch.
- **Add photos:** select several JPEG, PNG or WebP files, or drop them onto the
  desktop upload area. Each file is limited to 10 MiB. Files upload and process
  sequentially; a failed file has its own retry/reselection controls and does
  not discard other uploads.
- **Review uploads:** use the large preview and Previous/Next controls. Give each
  photo a caption, useful image description and correct building/entrance match.
  The image itself must be checked for identity and visual quality individually.
- **I took this photo:** enter the public photographer credit, deliberately select
  a supported reuse license and confirm authorship. No source website is needed.
  **Photo from another source** requires its original source page, photographer,
  license evidence and attribution. Standard Creative Commons license links are
  filled automatically; suggested credits remain editable. Capture dates are
  optional and never inferred. Existing approved rights remain reviewed until
  their source, author, license or attribution changes.
- **Use shared credits:** explicitly select uploads, then apply author/license
  details from the current photo. This never copies a building match, capture date,
  description, authorship declaration or individual quality/rights confirmation.
- **Mark ready**, then **Add reviewed photos to draft**, attaches all ready items
  in one undoable batch. Unfinished items remain private. If attachment is
  interrupted after approval, the approved details remain locked and retryable;
  use Private uploads to create another revision if those details need changing.
- **Preview public gallery** uses visitors' ordering, captions and credits. It
  does not publish. **Saved privately**, **In map draft**, and **Published** are
  distinct states; publication still happens through Releases.

### Recovery and privacy

Unfinished metadata is saved locally per owner and original gallery, and uploaded
metadata synchronizes privately when online. Switching inspectors never attaches
an upload to the new selection. After reopening, uploaded derivatives can resume
review; files that never finished uploading explicitly request reselection.

Uploads continue after closing the photo dialog or selecting another building,
while the editor session stays available. **Pause uploads** in the persistent
indicator finishes the current upload/processing operation, then stops before
the next file. **Resume uploads** continues the queue. Keep the browser open until
original files finish uploading; browser closure and operating-system suspension
do not provide background-upload guarantees. Signing out stops further owner
requests and clears private previews from memory.

Recovery uses per-photo IndexedDB records. Existing localStorage drafts migrate
only after their replacement is stored successfully. The indicator distinguishes
pending local recovery from saved recovery; **Saved privately** on a photo means
the server acknowledged its details. A storage error remains visible and app
updates wait for recovery and original uploads. Only one tab owns an owner's
queue at a time; another tab can take over after the current editor closes.
Browsers without Web Locks show an explanation instead of risking duplicate
uploads. Galleries and upload queues also use pages of 20 photographs.

**Private uploads** provides a searchable gallery with 20 items per page and
**Previous page / Next page**. Resume an item to recover its recorded target and details. Expired
signed previews renew without reprocessing the original. Stale draft saves are
rejected instead of overwriting a newer session; recover the latest private
upload before continuing. Removing an item from the local queue does not delete
its private upload. Approved records are immutable; edits create a new revision.

Originals and upload/reviewer records remain in the private `building-media`
bucket and owner-authorized `building_media` table. The server rejects malformed,
animated, oversized or unsupported images and creates a metadata-free WebP at
most 1,600 pixels on its longest side and 250 KiB. Cropping, rotation controls and
image alteration are outside this workflow. Explicit owner galleries, including
empty galleries, override the research catalogue through aliases and merges.

New installations apply migrations in order through
[`010_private_photo_drafts.sql`](../supabase/migrations/010_private_photo_drafts.sql).
Migration 008 adds private media storage; 009 bounds baseline reconciliation; 010
adds private draft metadata, filenames, target associations and revision guards.
Migration 010 was applied to production on 23 September 2026. Owner RLS,
approved-record immutability, a private bucket and no anonymous table reads were
verified. It does not publish a map or grant public access to originals.

The responsiveness update needs no additional database migration or public
package schema. Its additive upload reconciliation and preview endpoints use
the existing media records. [Measurements and test coverage](PERFORMANCE.md).

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
rollback. Older schema-1 and schema-2 packages remain readable with absent
information omitted. Releases containing author-provided photos without an
external source URL use **schema 3**. Deploy compatible application, editor,
importer and publication readers before publishing those releases. Older clients
request an app update and retain their working package. Public author-upload
credits say “Photograph provided by the author”; private authorship declarations
and account identities are never included in downloads.

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
