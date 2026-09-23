"""Inventory a fixed existing campus publication without copying its photographs into downloads.
Run with pypdf and PyMuPDF installed. Original source is read-only and remains in ignored data/raw.
"""
import hashlib
import json
import re
from pathlib import Path
from datetime import datetime, timezone
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
raw = ROOT / 'data/raw/building-references/365-days.pdf'
campus = json.loads((ROOT / 'data/raw/published-arrival-campus.json').read_text(encoding='utf-8'))
document = pymupdf.open(raw)
url = 'https://ibiyemiolatunjibello.com/wp-content/uploads/2022/09/365-single-pages.pdf'
pages = [p.get_text() for p in document]
normal = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
buildings = []
for feature in campus['map']['features']:
    props = feature.get('properties', {})
    if props.get('kind') != 'building':
        continue
    names = [props.get('name', '')]
    for place in campus['places']:
        if place.get('buildingId') == props['id'] or place['id'] in [props.get('placeId'), props['id']]:
            names += [place['name'], *place.get('aliases', [])]
    names = sorted(set(n for n in names if n and n not in ['Building', 'Campus building']))
    matches = [{'name': name, 'pages': [i+1 for i, text in enumerate(pages) if normal(name) in normal(text)]} for name in names]
    buildings.append({'id': props['id'], 'queries': matches, 'unnamed': not names})
candidates = []
seen = {}
for i, page in enumerate(document):
    for number, info in enumerate(page.get_images(full=True)):
        xref = info[0]
        image = document.extract_image(xref)
        digest = hashlib.sha256(image['image']).hexdigest()
        identifier = f'lasu-365:page-{i+1}:image-{number+1}'
        relevant = 23 <= i+1 <= 26 and image['width'] > 100 and image['height'] > 80
        duplicate = seen.get(digest)
        candidates.append({'id': identifier, 'sourceUrl': f'{url}#page={i+1}', 'sha256': digest, 'width': image['width'], 'height': image['height'], 'status': 'duplicate' if duplicate else 'awaiting evidence/permission' if relevant else 'rejected', 'duplicateOf': duplicate, 'reason': 'Identical embedded image.' if duplicate else 'Historical campus project photograph; original photographer, reuse permission and individual building identity require confirmation.' if relevant else 'Decoration, document graphic, portrait or event image outside the building-photo selection.', 'capturedAt': None})
        seen.setdefault(digest, identifier)
report = {'sourceUrl': url, 'title': 'LASU Compendium of Achievements — 365 Days in Office (20 September 2022)', 'sha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'bytes': raw.stat().st_size, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'permission': 'No confirmed offline photograph redistribution permission; none included.', 'buildings': buildings, 'candidates': candidates}
target = ROOT / 'data/photos/research/publication-inventory.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
print(json.dumps({'buildings': len(buildings), 'candidates': len(candidates), 'statuses': {status: sum(c['status'] == status for c in candidates) for status in ['duplicate', 'rejected', 'awaiting evidence/permission']}}))
