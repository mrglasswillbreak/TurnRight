"""Acceptance for the reviewed LASU surface and UNILAG parcel patches."""
import json
import unittest
from pathlib import Path
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from pyproj import Transformer

ROOT=Path(__file__).resolve().parents[2]/'data/campus-layer-enrichment'
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
class CampusLayerDetailTests(unittest.TestCase):
    def test_lasu_surfaces_are_valid_nonoverlapping_estimates_and_account_for_all_roads(self):
        changes=read('lasu-changes.json');report=read('lasu-surface-coverage.json')
        surfaces=changes['featureAdds']
        self.assertEqual(len(surfaces),82)
        self.assertEqual(len(report['roads']),report['sourceRoads'])
        self.assertEqual(report['sourceRoads'],95)
        metric=Transformer.from_crs(4326,32631,always_xy=True).transform
        shapes=[]
        for f in surfaces:
            g=shape(f['geometry']);self.assertTrue(g.is_valid,f['properties']['id']);self.assertFalse(g.is_empty)
            p=f['properties'];self.assertEqual(p['kind'],'land');self.assertEqual(p['widthEvidence'],'illustrative')
            self.assertIn(p['width'],[6,4,3,1.8]);self.assertNotIn('access',p);self.assertNotIn('walkingAccess',p)
            self.assertTrue(p['derivedSurface']['sourceRevision']);self.assertTrue(p['derivedSurface']['sourceRoadId'])
            shapes.append(transform(metric,g))
        self.assertLess(abs(sum(g.area for g in shapes)-unary_union(shapes).area),0.01)
        self.assertAlmostEqual(sum(g.area for g in shapes),report['areaM2'],places=2)
    def test_parcel_corrections_keep_original_feature_identities(self):
        changes=read('unilag-changes.json');updates=changes['featureUpdates']
        self.assertEqual(len(updates),426);self.assertEqual(len({p['id'] for p in updates}),426)
        self.assertEqual(changes['featureAdds'],[])
        for p in updates:
            self.assertIn(p['properties']['landClass'],['parcel','parking','green'])
            self.assertNotEqual(p['properties']['vegetation'],'trees')
    def test_source_review_dispositions_are_complete(self):
        ledger=read('lasu-candidate-ledger.json')
        self.assertEqual(len(ledger['arcgisLandscapeComparison']),30)
        self.assertTrue(all(r['nameMatches'] for r in ledger['arcgisLandscapeComparison']))
        self.assertEqual(sum(ledger['decisions'].values()),len(ledger['candidates']))
        creek=next(r for r in ledger['candidates'] if r['id']=='relation:2116060')
        self.assertEqual(creek['status'],'excluded')
