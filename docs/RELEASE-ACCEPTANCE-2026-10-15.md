# Manual release acceptance · 15 October 2026

These checks remain open. Passing automated tests or viewing a desktop browser does not establish these outcomes. Record the device/account, campus package version, date, result and any issue reference for each test. The [production record](PRODUCTION.md) distinguishes application deployment, map publication and field acceptance.

| Check                                    | What to do                                                                                                                                                                                                                                       | Expected result                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android installation and offline restart | Install the app from a supported Android browser. Download each campus, close the app, disconnect networking, reopen it and plan a route using mapped starting places. Reconnect and check the next package update.                              | The intended campus, photos, models and directions remain available; campus switching never substitutes another campus's data. Updates retain saved places and private work.                                                             |
| iPhone installation and offline restart  | Repeat on a real iPhone, including closing/reopening the installed app and testing portrait/landscape layouts and the on-screen keyboard.                                                                                                        | Controls remain reachable, text inputs stay visible and offline packages reopen reliably.                                                                                                                                                |
| GPS, spoken directions and lifecycle     | Walk a known route on each campus. Test location permission granted and declined, optional compass/motion declined, spoken directions, screen lock/resume and a deliberate departure from the mapped route.                                      | Position, prompts and rerouting behave consistently; denied permissions leave usable mapped-place routing. Do not treat a GPS simulation as field evidence.                                                                              |
| Entrances, access and hazards            | Verify representative gate-to-building walks, the final doorway, stairs, closures, restricted access and the excluded building-crossing segments. Include LASU C.P.S, Makanjuola Theatre and the UNILAG Main Library connection.                 | Only observed, permitted connections are added. Unverified or unavailable entrances/access remain clearly labelled; excluded segments are not reconnected simply to clear a warning.                                                     |
| Source identity review                   | Inspect repeated names and overlapping footprints in Review → Duplicates, especially records from different source layers.                                                                                                                       | Distinct places stay separate. Any merge retains the correct identity, photographs, entrances, source evidence and routes; proximity or matching names alone does not justify deletion.                                                  |
| Dense-model touch performance            | On representative lower-powered phones, open a detailed/rounded building model, use reference split, resize/rotate, open the keyboard, save, undo and reload.                                                                                    | No renderer crash, missing model, trapped control or lost edit. Record timings against [Performance](PERFORMANCE.md); the documented dense-model targets remain unresolved.                                                              |
| Screen readers and keyboard              | Use VoiceOver on iPhone/Safari and a desktop screen reader to search, choose a campus, open details and route previews, then navigate editor workspaces and dialogs with the keyboard.                                                           | Names, roles, selected states and status updates are understandable; focus stays visible, dialogs return focus, and no operation traps keyboard users. Automated role/focus assertions do not establish assistive-technology acceptance. |
| Independent team roles                   | In a test environment, use separate editor, reviewer and publisher accounts. Exercise permitted edits, self-approval denial, independent review, publication and revocation of each role.                                                        | Denied actions remain denied after refresh; revoked review/publish access invalidates promotion. Record the original-owner exception explicitly if used.                                                                                 |
| Complete recovery                        | Configure a private direct database connection or platform backup facility. Back up the full database and required Auth/configuration and Storage objects; restore to an isolated project and verify counts, hashes, accounts, media and routes. | Recovery succeeds without changing production. The failed API archive, function SQL copies and a synthetic fixture restore are not sufficient. The current Free plan has no scheduled project backup.                                    |
| Published rollback                       | In an approved maintenance window, submit a restoration of an earlier campus release, review it, build its preview and promote it; then restore the intended current release.                                                                    | The other campus is unchanged and every restored package/asset matches its recorded hash. Do not silently exercise a public rollback as a smoke test.                                                                                    |

The [publication receipt](assets/campus-publication-2026-10-15.json) lists every unresolved arrival and duplicate candidate against its exact public package. Use these identifiers for field/identity review; do not infer that all candidates are duplicate physical places.

Owner input is still needed for the root software licence, the security reporting contact, and confirmation of source/photo/ArcGIS redistribution rights. Existing metadata records a claim or attribution; it does not independently establish permission.

The focused Windows WebKit model run on this date completed with **two passes and four timeouts across six attempts**. Failures occurred around reference split, Orbit and short-landscape controls. Earlier Linux PR runs also showed a renderer crash and a separate click stall; the later Linux release/PR runs passed these cases. Traces do not establish a single application or browser cause. Keep reference split, repeated opening/closing, rotation and editing on the real Safari/iPhone checklist. Playwright's [browser documentation](https://playwright.dev/docs/browsers#webkit) explains that its WebKit build and platform capabilities differ from shipped Safari. Passing Linux automation does not close this device acceptance item.

Source proposal generation remains disabled by policy. Before enabling it, complete per-source shadow parity and the [staged source rollout](SOURCE-UPDATES.md#staged-reliability-rollout). This is separate from publishing the already reviewed campus drafts.

## Destinations without a mapped arrival

These destinations remain searchable, but need observed entrance/approach evidence before a connection can be added. Repeated names retain their source identifiers so reviewers can distinguish records.

| Campus | Destination                                                              | Public record                                   |
| ------ | ------------------------------------------------------------------------ | ----------------------------------------------- |
| LASU   | Sport Center                                                             | `arcgis:Infrastructure:1`                       |
| LASU   | LASU Main Auditorium                                                     | `arcgis:Infrastructure:104`                     |
| LASU   | Proposed TECH Hub                                                        | `arcgis:Infrastructure:128`                     |
| LASU   | Lagos Home Block 1                                                       | `arcgis:Infrastructure:71`                      |
| LASU   | Lagos Home Block 2                                                       | `arcgis:Infrastructure:72`                      |
| LASU   | Lagos Home Block 3                                                       | `arcgis:Infrastructure:73`                      |
| LASU   | LASU Int. Sch. Building 2                                                | `arcgis:Infrastructure:77`                      |
| LASU   | Ongoing Student Village 2                                                | `arcgis:Infrastructure:79`                      |
| LASU   | New Staff Quarters Block 1                                               | `arcgis:University_Property:0`                  |
| LASU   | FMS Extension                                                            | `arcgis:University_Property:107`                |
| LASU   | LASU Int. Sch. Building 2                                                | `arcgis:University_Property:124`                |
| LASU   | Ongoing FMS Extension                                                    | `arcgis:University_Property:38`                 |
| LASU   | Staff School                                                             | `arcgis:University_Property:53`                 |
| LASU   | New Staff Quarters Block 3                                               | `arcgis:University_Property:64`                 |
| LASU   | New Staff Quarters Block 2                                               | `arcgis:University_Property:72`                 |
| LASU   | Sports Center                                                            | `arcgis:University_Property:92`                 |
| LASU   | Senior Staff Club                                                        | `overture:1fa7edcc-9e89-4d63-8cd0-aca2605c5f3d` |
| LASU   | Leus Travels and Tours                                                   | `overture:4a44de47-0fb4-4229-9ba7-08fe0334536b` |
| LASU   | Lasu-Aceitse                                                             | `overture:6104489c-e212-4a3b-a851-d37caeedb25c` |
| LASU   | Lagos State University                                                   | `overture:7ad07290-62d8-41bf-b72e-d95b3c810c06` |
| LASU   | Chapel Of Light                                                          | `overture:8d0505d6-dc95-4187-b5ab-2f085a2d682e` |
| LASU   | Golden touch makeover                                                    | `overture:9148b370-d614-43b0-8624-99201fff2d3e` |
| LASU   | Sun & Dry laundry                                                        | `overture:ae7ab1f6-7652-4c83-842e-249659180447` |
| LASU   | Temma's Closet                                                           | `overture:c169b9c6-c0b2-4027-9cac-bf1d9f47796c` |
| LASU   | Lasu Faculty of Management                                               | `overture:d2d5fbdf-f0e1-401e-a066-fa1221b145a8` |
| LASU   | Lagos State University Open and Distance Learning and Research Institute | `overture:e506f4bd-b1ad-411b-ab16-1d4f1ee359d2` |
| LASU   | Campus place                                                             | `85fccf12-42d9-43de-a282-893714317cba`          |
| UNILAG | UNILAG Science Diploma Building                                          | `review:unilag:detail:01d6520a99f03422`         |
| UNILAG | Ozolua Bq                                                                | `review:unilag:detail:0562b03328927d94`         |
| UNILAG | Salado Cafeteria                                                         | `review:unilag:detail:1c298e5c46808136`         |
| UNILAG | Fagunwa Hostel                                                           | `review:unilag:detail:2298288f95ac4d85`         |
| UNILAG | University Of Lagos Women Society (Creche)                               | `review:unilag:detail:2522e6a6afa2d81b`         |
| UNILAG | Akintunde Ojo Memorial Hall                                              | `review:unilag:detail:25b04a0d48bc37cc`         |
| UNILAG | Access Bank Plc - UNILAG                                                 | `review:unilag:detail:301d57e958c1f193`         |
| UNILAG | Henry Carr Hall                                                          | `review:unilag:detail:345f81f27fba1d86`         |
| UNILAG | Faculty Of Arts                                                          | `review:unilag:detail:3c438fbaed7e9328`         |
| UNILAG | International School, UNILAG                                             | `review:unilag:detail:419847604296f706`         |
| UNILAG | King Jaja Hall                                                           | `review:unilag:detail:41bef0b150da7a76`         |
| UNILAG | Faculty Of Law                                                           | `review:unilag:detail:4a400b8f4338f388`         |
| UNILAG | Students Lodge                                                           | `review:unilag:detail:4fd4ce8315a78f0f`         |
| UNILAG | Rahman Bello Auditorium                                                  | `review:unilag:detail:516742f0cef3c547`         |
| UNILAG | Madam Tinubu Hall                                                        | `review:unilag:detail:561e30127729c959`         |
| UNILAG | St Thomas More Catholic Chaplaincy                                       | `review:unilag:detail:6248e708e31a6cf8`         |
| UNILAG | Kaaf Medical Center                                                      | `review:unilag:detail:62f5e9c27219d52f`         |
| UNILAG | Cits (Centre For Information And Technology System)                      | `review:unilag:detail:67619008948c696f`         |
| UNILAG | Nord                                                                     | `review:unilag:detail:676519616d53008e`         |
| UNILAG | Guest House                                                              | `review:unilag:detail:69c1ff4ceb94b56f`         |
| UNILAG | Faculty Of Management Sciences                                           | `review:unilag:detail:69e6339f121af49e`         |
| UNILAG | Moremi Hall                                                              | `review:unilag:detail:6fc6e3fc608ac317`         |
| UNILAG | Faculty Of Education                                                     | `review:unilag:detail:7047685317c3ba1c`         |
| UNILAG | Faculty Of Mass Communication                                            | `review:unilag:detail:71b9beee08234299`         |
| UNILAG | Yem-Yem Supermarket                                                      | `review:unilag:detail:779ee8086501956f`         |
| UNILAG | UNILAG Fire Station                                                      | `review:unilag:detail:7cd59335fb9ed522`         |
| UNILAG | Faculty Of Engineering                                                   | `review:unilag:detail:880d07dc4369c62c`         |
| UNILAG | Education Bus Stop                                                       | `review:unilag:detail:8d63feb1addcc268`         |
| UNILAG | Mariere Hall                                                             | `review:unilag:detail:912759d3e492d01d`         |
| UNILAG | UNILAG Bus Terminal                                                      | `review:unilag:detail:914e333d7b2c866f`         |
| UNILAG | Department Of Chemical Engineering                                       | `review:unilag:detail:ab54df53747abe3f`         |
| UNILAG | Faculty Of Environmental Sciences                                        | `review:unilag:detail:af5e89c5cf6820ff`         |
| UNILAG | UNILAG Pharmacy                                                          | `review:unilag:detail:b3df9cb6213337de`         |
| UNILAG | Department Of Geoscience                                                 | `review:unilag:detail:bc4af118152a1c47`         |
| UNILAG | Queen Amina Hall                                                         | `review:unilag:detail:cb07f63f4ced70a4`         |
| UNILAG | ISLamic Institute                                                        | `review:unilag:detail:cc5553c24956bc9b`         |
| UNILAG | El Kanemi Hall-UNILAG                                                    | `review:unilag:detail:cf5250470c1340ac`         |
| UNILAG | UNILAG Bookshop                                                          | `review:unilag:detail:cf84711545abe060`         |
| UNILAG | Faculty Of Science                                                       | `review:unilag:detail:e1eb0c9e5bba60a7`         |
| UNILAG | Faculty Of Science Library                                               | `review:unilag:detail:e4517548658b28c5`         |
| UNILAG | Oyewusi Ibidapo-Obe House                                                | `review:unilag:detail:e60c2be54fd4c110`         |
| UNILAG | J. F. Ade Ajayi Auditorium                                               | `review:unilag:detail:f10f46c6db1fb4ff`         |
| UNILAG | Iya Moria                                                                | `review:unilag:detail:f4882ab14d1450ed`         |
| UNILAG | UNILAG Gate House                                                        | `review:unilag:detail:faa1c523a5745521`         |
| UNILAG | University Of Lagos Women Society Hostel                                 | `review:unilag:detail:fdec1607f09c120f`         |
| UNILAG | Main Library                                                             | `review:unilag:parcel:329`                      |
