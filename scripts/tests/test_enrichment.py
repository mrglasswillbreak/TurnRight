import json
import pathlib
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from place_enrichment import names, classify, details, enrich_osm
from overture_enrichment import read_extract, apply_overture
from download_overture import matching_assets
from enrich_campus import candidate_version, preserve_published_owner_data


def campus():
    return {'boundary': {'type': 'Feature', 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}, 'places': [], 'map': {'features': []}, 'graph': {'edges': []}, 'sources': []}


def place(identifier='test', name='LASU Cafe', x=.2, category=True):
    return {'type': 'Feature', 'id': identifier, 'geometry': {'type': 'Point', 'coordinates': [x,.2]}, 'properties': {
        'names': {'primary': name}, 'basic_category': 'cafe' if category else None, 'taxonomy': None,
        'sources': [{'dataset': 'meta', 'record_id': identifier}], 'phones': ['+234123']}}


class EnrichmentTests(unittest.TestCase):
    def test_owner_geometry_and_access_survive_repeated_refreshes(self):
        import copy
        baseline = campus()
        baseline['map']['features'] = [{'properties': {'id': 'owner-road', 'kind': 'path'}, 'geometry': {'type': 'LineString', 'coordinates': [[.1,.1],[.2,.2]]}}]
        baseline['graph'] = {'nodes': [{'id': 'owner-node', 'coordinates': [.1,.1]}], 'edges': [{'id': 'owner-edge', 'sourceId': 'owner-road', 'from': 'owner-node', 'to': 'owner-node', 'vehicle': {'access': 'private'}}]}
        baseline['places'] = [{'id': 'owner-place'}]
        baseline['driving'] = {'parking': [{'id': 'parking'}], 'restrictions': [{'id': 'owner-turn'}]}
        candidate = campus()
        candidate['graph']['nodes'] = []
        candidate['driving'] = {'parking': [], 'restrictions': []}
        preserve_published_owner_data(baseline, candidate)
        once = copy.deepcopy(candidate)
        preserve_published_owner_data(baseline, candidate)
        self.assertEqual(candidate, once)
        self.assertEqual(candidate['graph'], baseline['graph'])
        self.assertEqual(candidate['driving'], baseline['driving'])

    def test_replay_version_ignores_only_audit_times(self):
        data = {'version': 'old', 'createdAt': 'yesterday', 'places': [{'name': 'Library', 'evidence': {'checkedAt': 'yesterday'}}], 'driving': {'version': 1}}
        old = candidate_version(data)
        data.update(version='new', createdAt='today')
        data['places'][0]['evidence']['checkedAt'] = 'today'
        self.assertEqual(candidate_version(data), old)
        data['driving']['version'] = 2
        self.assertNotEqual(candidate_version(data), old)

    def test_null_stac_collection_does_not_hide_existing_campus_data(self):
        def row(kind, bounds):
            return {'collection': None, 'bbox': bounds, 'assets': {'aws': {'alternate': {'s3': {'href': f's3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type={kind}/part.parquet'}}}}}
        bounds = {'xmin':3.19,'ymin':6.455,'xmax':3.215,'ymax':6.489}
        self.assertEqual(len(matching_assets([row('place',bounds)],'place','2026-08-19.0',(3.194,6.46,3.205,6.48))),1)
        with self.assertRaisesRegex(ValueError,'lacks requested theme'):
            matching_assets([row('building',bounds)],'place','2026-08-19.0',(3.194,6.46,3.205,6.48))

    def test_tag_first_food_and_multilingual_names(self):
        self.assertEqual(classify({'name': 'Science Restaurant', 'amenity': 'restaurant'}), ('food','restaurant'))
        self.assertEqual(classify({'shop': 'books'})[0], 'services')
        self.assertEqual(names({'name': 'Main Road', 'alt_name': 'Old Road;Campus Road', 'name:yo': 'Ọ̀nà'}), ('Main Road', ['Old Road','Campus Road','Ọ̀nà']))
        self.assertNotIn('website', details({'website': 'javascript:alert(1)'}))

    def test_multipolygon_hole_and_two_tenants(self):
        xml = '<osm>' + ''.join(f'<node id="{i}" lon="{x}" lat="{y}"/>' for i,(x,y) in enumerate([(.1,.1),(.8,.1),(.8,.8),(.1,.8),(.3,.3),(.6,.3),(.6,.6),(.3,.6)],1))
        xml += '<way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/></way><way id="2"><nd ref="3"/><nd ref="4"/><nd ref="1"/></way><way id="3"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/></way>'
        xml += '<relation id="99"><member type="way" ref="1" role="outer"/><member type="way" ref="2" role="outer"/><member type="way" ref="3" role="inner"/><tag k="type" v="multipolygon"/><tag k="building" v="yes"/><tag k="name" v="Centre"/></relation>'
        for i, name in [(20,'Food One'), (21,'Food Two')]:
            xml += f'<node id="{i}" lon=".2" lat=".2"><tag k="name" v="{name}"/><tag k="amenity" v="restaurant"/></node>'
        data = campus()
        issues = enrich_osm(data, ET.fromstring(xml + '</osm>'), '2026-09-22')
        self.assertFalse(issues)
        self.assertEqual(len(data['places']), 3)
        self.assertEqual(len(data['map']['features'][0]['geometry']['coordinates']), 2)
        self.assertTrue(all(p['arrivalKind'] == 'unmapped' for p in data['places']))
        self.assertEqual(data['graph']['edges'], [])

    def test_invalid_and_boundary_geometry_are_held(self):
        data = campus()
        tree = ET.fromstring('<osm><node id="1" lon=".2" lat=".2"/><node id="2" lon="2" lat=".2"/><way id="3"><nd ref="1"/><nd ref="2"/><tag k="highway" v="service"/></way><relation id="4"><member type="way" ref="999" role="outer"/><tag k="type" v="multipolygon"/><tag k="building" v="yes"/></relation></osm>')
        issues = enrich_osm(data, tree, '2026-09-22')
        self.assertEqual(len(issues), 2)
        self.assertTrue(all(i['status'] == 'awaiting-evidence' for i in issues))

    def test_overture_no_automatic_duplicates_access_or_outside_places(self):
        data = campus()
        a = place()
        b = place('duplicate')
        c = place('outside', x=2)
        rows, overlay = apply_overture(data, {'place': [a,b,c]}, '2026-08-19.0', '2026-09-22')
        self.assertEqual(len(data['places']), 1)
        self.assertEqual(data['places'][0]['category'], 'food')
        self.assertNotIn('graphNode', data['places'][0])
        self.assertEqual(rows[1]['matches'], ['overture:test'])
        self.assertEqual(rows[2]['status'], 'rejected')
        self.assertTrue(overlay['features'])
        self.assertTrue(data['sources'])

    def test_unknown_license_and_null_taxonomy_are_review_items(self):
        a, b = place(), place('none',category=False)
        a['properties']['sources'][0]['dataset'] = 'unreviewed-provider'
        data = campus()
        rows, _ = apply_overture(data, {'place': [a,b]}, '2026-08-19.0', '2026-09-22')
        self.assertEqual(data['places'], [])
        self.assertTrue(all(r['status'] == 'awaiting-evidence' for r in rows))

    def test_off_campus_business_geocoded_on_campus_needs_corroboration(self):
        p=place(name='Zinette Homes')
        p['properties']['addresses']=[{'freeform':'298 Adeyemo Akapo street, Omole phase one'}]
        data=campus()
        rows,_=apply_overture(data,{'place':[p]},'2026-08-19.0','2026-09-22')
        self.assertFalse(data['places'])
        self.assertIn('corroboration',rows[0]['reason'])

    def test_complete_empty_and_incomplete_extracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / 'places.json'
            p.write_text(json.dumps({'type':'FeatureCollection','features': [place(category=False)]}))
            self.assertEqual(len(read_extract(p,'place')), 1)
            p.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Incomplete'): read_extract(p,'place')
            p.write_text('{')
            with self.assertRaises(json.JSONDecodeError): read_extract(p,'place')


if __name__ == '__main__': unittest.main()
