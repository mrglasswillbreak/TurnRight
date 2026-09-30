"""Acceptance for the reviewed, public UNILAG geometry patch (no raw uploads)."""
import json
import unittest
from pathlib import Path
from collections import Counter
from shapely.geometry import shape

ROOT=Path(__file__).resolve().parents[2]

class UnilagDetailTests(unittest.TestCase):
    def test_every_road_identity_is_valid_and_classified(self):
        patch=json.loads((ROOT/'data/unilag-enrichment/changes.json').read_text(encoding='utf-8'))
        roads=[f for f in patch['featureAdds'] if f['properties']['source']=='import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e']
        self.assertEqual(len(roads),179)
        self.assertEqual({f['properties']['sourceId'] for f in roads},{str(i) for i in range(1,180)})
        self.assertEqual(Counter((f['properties']['landClass'],f['properties']['surface']) for f in roads),{('road','paved'):80,('road','unpaved'):24,('sidewalk','paved'):75})
        for feature in patch['featureAdds']:
            geometry=shape(feature['geometry'])
            self.assertTrue(geometry.is_valid,feature['properties']['id'])
            self.assertFalse(geometry.is_empty)
            self.assertNotEqual(feature['properties']['kind'],'path')
            self.assertNotIn('walkingAccess',feature['properties'])

    def test_repair_and_review_are_accounted(self):
        report=json.loads((ROOT/'data/unilag-enrichment/coverage.json').read_text(encoding='utf-8'))
        repair=next(r for r in report['roads']['repairs'] if r['sourceId']=='96')
        self.assertFalse(repair['beforeValid'])
        self.assertTrue(repair['afterValid'])
        self.assertLessEqual(repair['areaChangePercent'],1)
        self.assertEqual(repair['discardedComponents'],0)
        self.assertEqual(Counter(c['status'] for c in report['candidates']),report['candidateCounts'])
        self.assertTrue({'osm-way','osm-node','osm-relation','road-width'}.issubset({c['source'] for c in report['candidates']}))

if __name__=='__main__':unittest.main()
