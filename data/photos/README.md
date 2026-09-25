# LASU Ojo building photograph collection

This is the historical **23 September collection audit**, against published map
**lasu-a81135d18314**. Its counts describe that research corpus. The current
25 September gallery uses **lasu-623791e1184e**, with 395 buildings and 39
photographs covering 19 buildings. See [current photo/model coverage](../../docs/PHOTO-MODEL-COVERAGE.md)
and the [application screenshot inventory](../../docs/assets/screenshots/README.md).

## Original collection audit
The inventory covers **420 buildings**: 130 have searchable names/linked aliases,
and 290 have no sufficiently specific name. It preserves their stable IDs.

| Coverage | Before | Reviewed collection |
| --- | ---: | ---: |
| Buildings | 420 | 420 |
| Buildings with verified public photographs | 0 | 13 |
| Buildings without verified public photographs | 420 | 407 |
| Distinct release photographs | 0 | 21 |
| Photograph download bytes | 0 | 4,218,642 (4.02 MiB) |

The included buildings are the School of Communication, Students' Arcade,
LASU Radio, Law Clinic, Senate Building, School of Transport, Postgraduate
School, Law Library, MBA complex, International Library, Faculty of Education,
Theatre Art and Music, and ICT Centre. Several have multiple distinct views.
Every derivative received visual review. General photographs do not identify
an occupant's permitted doorway or create a graph connection.

## Accounted candidates

| Documented corpus | Included | Duplicate | Rejected | Awaiting evidence/permission |
| --- | ---: | ---: | ---: | ---: |
| Commons photograph candidates | 21 | 1 | 476 | 24 |
| Other Commons search hits | 0 | 0 | 7,069 | 0 |
| Embedded campus-publication images | 0 | 166 | 180 | 39 |
| Total | 21 | 167 | 7,725 | 63 |

All **7,976** discovered records in these source snapshots have a classification
and reason. Broad search hits include documents, events and foreign-language
false matches: “lasu” also appears in Polish forest descriptions. These counts
are not counts of undiscovered campus buildings. Duplicate publication images
include repeated decorations; the Eco Market banner is a crop of its retained
evidence candidate. Included viewpoints were visually compared, and exact
derivative hashes are unique.

Unresolved examples include the printing press, older Main Library, science
complexes and sports hall where a source name cannot yet be reliably linked to
one published footprint. Campus gates are retained as future entrance-evidence
candidates rather than arbitrarily assigned to a building. Photos of Epe,
LASUED, LASUSTECH and unrelated institutions are rejected. Unnamed footprints
were included in the campus inventory and considered against identifiable
photos, but none received a speculative match.

## Sources and evidence

- [Wikimedia Commons LASU category](https://commons.wikimedia.org/wiki/Category:Lagos_State_University): 66 files at retrieval, existing 37 project references, 131 distinct named-building/alias searches, and four broader campus queries. `research/commons-inventory.json` records all 420 building rows, queries, results, original file metadata, decisions, rights, source URLs, checksums and retrieval receipts.
- [LASU 365 Days in Office, 2022](https://ibiyemiolatunjibello.com/wp-content/uploads/2022/09/365-single-pages.pdf): searched all building names/aliases in extracted text; visually reviewed infrastructure pages 23–26. The 42-page document yielded 385 embedded image records. Raster-only captions are not guaranteed searchable. `research/publication-inventory.json` records the fixed document checksum and every decision. No photo reuse permission was established, so no image from it is bundled.
- Existing `data/building-evidence.json`, accepted campus names/occupants and visually identifiable facade/sign details corroborate matches. Existing reference links alone were not treated as licenses. Official LASU library material helped distinguish the older Main Library from the International Library; general official publications with no redistribution grant remain outside downloads.

All 21 included images have original Commons author/source records and **CC BY-SA
4.0** redistribution licenses, carried in `catalogue.json` and the offline gallery.
The original authors retain copyright. WebP derivatives retain the same license:
[license text and notices](https://creativecommons.org/licenses/by-sa/4.0/).
Changes are limited to orientation, resizing, WebP conversion and embedded
metadata removal; no scene content was synthesized. Pre-2026 views are explicitly
historical. Capture dates are included only when recorded by the original source.

The complete original metadata audit is retained in
`research/source-metadata-audit.json`, including exact API responses and checksums.
It covers all 22 initially selected sources. One library image (Commons 199191750)
was withdrawn: its original metadata declares `trainedAlgorithmicMedia` and
"Made with Google AI". It is rejected even though its license permits reuse.
The remaining 21 have no synthetic-content marker in their source metadata;
this check supplements visual identity review rather than proving authenticity.
Collection now requires an original-checksum-matched metadata audit and rejects
declared synthetic images before derivative generation.

Original downloads are checked against Commons SHA-1 where available. Previously
retrieved Commons thumbnail variants are also valid licensed processing inputs;
their exact URL, byte length and SHA-256 are fixed in `research/inputs.json`.
The tool does not pretend thumbnail bytes are originals. Every published file is
at most 1,600 pixels on its longest side and 250 KiB, with no embedded EXIF, GPS,
XMP or ICC data. All 21 files are included offline; there is no count limit.

## Reproduce or extend

Use Node 22 and the dependencies installed under `web`. The compressed
`research/commons-responses.json.gz` preserves the exact public source responses
and published baseline used by discovery, without bundling original photographs.
The source URLs and receipt hashes remain inspectable in the JSON inventory.

```sh
node scripts/research-building-photos.mjs --restore-snapshot
cd web
npx tsx ../scripts/collect-building-photos.mts
npx vitest run tests/photo-collection.test.ts
```

For a new review, retrieve and verify the chosen public campus snapshot first,
refresh discovery caches deliberately, review candidate rights and identities,
then edit `decisions.json` and run `node scripts/audit-photo-sources.mjs` for the
selected sources. The collector stops on incomplete downloads, changed
input hashes or missing rights; it never silently drops an approved photograph.
Respect upstream retry delays. To re-inventory the official publication, retrieve
the exact PDF above into `data/raw/building-references/365-days.pdf`, install
PyMuPDF in an isolated Python environment and run
`python scripts/research-campus-publication.py`.

Production releases include only `catalogue.json` public metadata and approved
derivatives, combined with owner galleries by the reviewed publication workflow.
Research queues and raw snapshots are not public app downloads. This collection
covers the documented sources and searches; it does **not** claim to contain
every photograph online, every real campus building, or any Google Maps imagery.
