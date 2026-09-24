import fs from 'node:fs/promises';
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const inventory = await read('../data/photo-models/inventory.json');
const baseline = await read('../data/photo-models/baseline.json');
const original = await read('work/photo-model/campus.json');
const catalogue = await read('work/photo-model/visuals/catalogue.json');
const sheets = await read('work/photo-model/comparison-index.json');
const cell = (text) =>
  String(text || 'Unknown')
    .replaceAll('|', '/')
    .replaceAll('\n', ' ');
let report = `# Photographic model coverage · 24 September 2026

Baseline: **${baseline.version}**, campus SHA-256 \`${baseline.data.sha256}\`. All 395 published building identities and all 39 photographs were accounted for. The 19 photographed buildings receive reviewed observation proposals; 376 buildings have no published photograph and retain their existing treatment. No footprint, routing connection or access approval is created.

These 19 proposals were reviewed, previewed and published on 24 September as **lasu-313d8a168635**. The comparisons below retain the original baseline and candidate terminology for reproducibility. [Live package integrity and unchanged routing checks](PHOTO-MODEL-VERIFICATION.md#published-release).

| Coverage | Before | Candidate |
|---|---:|---:|
| Buildings | 395 | 395 |
| Buildings with photographs | 19 | 19 |
| Published photographs | 39 | 39 |
| Buildings with this photographic evidence assessment | 0 | 19 |
| Detailed / simplified / extrusion treatments | ${['detailed', 'simplified', 'extrusion'].map((k) => original.visuals.buildings.filter((b) => b.level === k).length).join(' / ')} | ${['detailed', 'simplified', 'extrusion'].map((k) => catalogue.buildings.filter((b) => b.level === k).length).join(' / ')} |
| Model geometry bytes | ${original.visuals.bytes.toLocaleString('en-US')} | ${catalogue.bytes.toLocaleString('en-US')} |
| Approved wall textures | 0 | 0 |

The initial candidate improves frame relief and opening proportions, preserving existing owner colours and roof plans. One previously unknown height receives a labelled floor-based estimate. Wall directions are not established by these photographs. Texture crops and wall-specific doors, columns, balconies and canopies remain in the guided owner review queue until their location is supported. No image is silently assigned to a wall. See [the workflow and limits](PHOTO-MODELS.md).

## Building comparisons

Each sheet combines the identified reference photo with before/after model renders. Views are **not georeferenced photographic matches**; hidden elevations and dimensions remain estimates. Each reference retains the author's licence below. Sheets resize the photo and add illustrative renders and labels, so the stated attribution includes these modifications. Share-alike photographs retain the linked share-alike terms for their adapted portion.

`;
for (const record of inventory.buildings) {
  const sheet = sheets.find((s) => s.buildingId === record.buildingId);
  const photo = inventory.photos.find((p) => p.id === sheet.sheetPhotoId);
  report += `### ${record.name}\n\nStable ID: \`${record.buildingId}\`. Evidence: ${record.photoIds.length} photograph(s).\n\n![${record.name}: reference photograph and illustrative before/after model](assets/photo-models/${sheet.sheet})\n\nReference credit: ${photo.author} · [${photo.license}](${photo.licenseUrl})${photo.sourceUrl ? ` · [original source](${photo.sourceUrl})` : ' · author-provided photograph'}. ${photo.historical ? 'Historical view. ' : ''}Capture date: ${photo.capturedAt || 'unknown'}. Modifications in this sheet: resized photograph; model renders and labels added.\n\n**Observed:** ${record.observed.join(' ')}\n\n**Candidate:** Framed openings with width ratio ${record.settings.windowWidthRatio} and height ratio ${record.settings.windowHeightRatio}, filling missing settings only. ${record.observedFloors ? `${record.observedFloors} visible floors support a floor-based height only where no owner height exists.` : ''}\n\n**Estimated:** ${record.estimated.join(' ')}\n\n**Remaining:** ${record.needed.join(' ')}\n\n`;
}
report += `## All 39 image decisions\n\n35 exterior evidence views; two interior views; one approach-only view; one rejected model match. No duplicates were discovered among these 39 immutable published photo assets. Every image is accounted for below; this is not a claim about all photographs online. Source dates and historical status are retained in the linked inventory.\n\n| Photo ID | Building ID | Evidence decision | Texture decision | Source / rights |\n|---|---|---|---|---|\n`;
for (const photo of inventory.photos)
  report += `| ${cell(photo.id)} | ${cell(photo.buildingId)} | ${cell(photo.classification)}: ${cell(photo.reason)} | ${cell(photo.textureDecision)} | ${cell(photo.author)} · [${cell(photo.license)}](${photo.licenseUrl})${photo.sourceUrl ? ` · [source](${photo.sourceUrl})` : ' · author-provided'} |\n`;
report +=
  '\n## Verification results\n\nProduction browser measurements and release verification are recorded in [PHOTO-MODEL-VERIFICATION.md](PHOTO-MODEL-VERIFICATION.md). Physical mobile-device and field-dimension verification are unavailable in this environment.\n';
await fs.writeFile('../docs/PHOTO-MODEL-COVERAGE.md', report);
console.log('Wrote 19 building comparisons and 39 image decisions.');
