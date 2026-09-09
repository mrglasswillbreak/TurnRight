import copy
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from campus_access import walking_access, node_blocks_walking, connection_review
import import_campus


POLICY = {
    'id': 'test-student-access', 'audience': 'students', 'confirmedAt': '2026-09-09',
    'summary': 'Owner-confirmed ordinary campus roads',
    'wayIds': ['osm:way:101', 'osm:way:102', 'osm:way:103'],
}
PRIVATE_ROAD = {'highway': 'service', 'access': 'private'}

CONNECTION_POLICY = {
    **POLICY,
    'connectionReviews': [
        {'id': 'law-review', 'featureId': 'osm:way:104', 'confirmedAt': '2026-09-09',
         'expectedTags': {**PRIVATE_ROAD, 'service': 'driveway'}},
        {'id': 'library-review', 'featureId': 'osm:node:5', 'confirmedAt': '2026-09-09',
         'expectedTags': {'barrier': 'gate', 'access': 'private'}},
    ],
}


class CampusAccessTests(unittest.TestCase):
    def test_individual_driveway_review_only_opens_the_confirmed_connection(self):
        tags = {**PRIVATE_ROAD, 'service': 'driveway'}
        self.assertEqual(walking_access('osm:way:104', tags, CONNECTION_POLICY), 'campus')
        self.assertEqual(walking_access('osm:way:105', tags, CONNECTION_POLICY), 'private')
        self.assertEqual(walking_access('osm:way:104', tags, POLICY), 'private')
        self.assertEqual(walking_access('osm:way:104', {**tags, 'service': 'parking_aisle'}, CONNECTION_POLICY), 'private')
        self.assertEqual(connection_review('osm:way:104', tags, CONNECTION_POLICY)['id'], 'law-review')
        self.assertEqual(tags, {**PRIVATE_ROAD, 'service': 'driveway'})

    def test_individual_gate_review_does_not_open_other_gates_or_new_restrictions(self):
        tags = {'barrier': 'gate', 'access': 'private'}
        self.assertFalse(node_blocks_walking(tags, 'osm:node:5', CONNECTION_POLICY))
        self.assertTrue(node_blocks_walking(tags, 'osm:node:6', CONNECTION_POLICY))
        self.assertTrue(node_blocks_walking(tags, 'osm:node:5', POLICY))
        for change in [{'locked': 'yes'}, {'foot': 'no'}, {'foot': 'private'},
                       {'access': 'no'}, {'construction': 'yes'}, {'barrier': 'wall'},
                       {'foot:conditional': 'no @ (Mo-Fr)'}, {'private': 'staff'}]:
            with self.subTest(change=change):
                self.assertTrue(node_blocks_walking({**tags, **change}, 'osm:node:5', CONNECTION_POLICY))
        for change in [{'locked': 'yes'}, {'foot': 'no'}, {'access': 'no'},
                       {'construction': 'yes'}, {'access:conditional': 'no @ (Mo-Fr)'}]:
            with self.subTest(change=change):
                self.assertNotEqual(walking_access('osm:way:104', {**PRIVATE_ROAD, 'service': 'driveway', **change}, CONNECTION_POLICY), 'campus')

    def test_only_listed_ordinary_campus_roads_get_student_access(self):
        tags = copy.deepcopy(PRIVATE_ROAD)
        self.assertEqual(walking_access('osm:way:101', tags, POLICY), 'campus')
        self.assertEqual(tags, PRIVATE_ROAD)
        self.assertEqual(walking_access('osm:way:999', tags, POLICY), 'private')
        self.assertEqual(walking_access('osm:way:101', tags, {}), 'private')
        for service in ['driveway', 'parking_aisle', 'alley']:
            with self.subTest(service=service):
                self.assertEqual(walking_access('osm:way:101', {**tags, 'service': service}, POLICY), 'private')

    def test_specific_restrictions_override_the_campus_confirmation(self):
        cases = [
            ({'foot': 'no'}, 'no'), ({'foot': 'private'}, 'private'),
            ({'foot': 'use_sidepath'}, 'no'), ({'access': 'no'}, 'no'),
            ({'construction': 'yes'}, 'no'), ({'locked': 'yes'}, 'no'),
            ({'access:conditional': 'no @ (Mo-Fr)'}, 'private'),
            ({'foot:conditional': 'no @ (Mo-Fr)'}, 'private'),
            ({'private': 'employees'}, 'private'),
        ]
        for extra, expected in cases:
            with self.subTest(extra=extra):
                self.assertEqual(walking_access('osm:way:101', {**PRIVATE_ROAD, **extra}, POLICY), expected)

    def test_public_foot_permission_and_nonwalking_highways_keep_their_meaning(self):
        self.assertEqual(walking_access('osm:way:999', {'highway': 'footway'}, POLICY), 'yes')
        self.assertEqual(walking_access('osm:way:999', {**PRIVATE_ROAD, 'foot': 'yes'}, POLICY), 'yes')
        self.assertEqual(walking_access('osm:way:101', {'highway': 'motorway'}, POLICY), 'no')

    def test_gates_and_node_restrictions_are_not_opened(self):
        for tags in [
            {'barrier': 'gate'}, {'barrier': 'gate', 'access': 'private'},
            {'barrier': 'fence'}, {'access': 'no'}, {'foot': 'no'},
            {'foot': 'private'}, {'barrier': 'gate', 'access': 'yes', 'locked': 'yes'},
        ]:
            with self.subTest(tags=tags):
                self.assertTrue(node_blocks_walking(tags))
        self.assertFalse(node_blocks_walking({'barrier': 'gate', 'foot': 'yes'}))

    def test_import_preserves_real_junctions_and_skips_restricted_segments(self):
        boundary = {'rings': [[[3.199, 6.459], [3.204, 6.459], [3.204, 6.464], [3.199, 6.464], [3.199, 6.459]]]}
        layers = {
            'Boundary': [{'geometry': boundary, 'attributes': {}}],
            'Land Use Land Cover': [], 'University_Property': [],
            'Infrastructure': [{'geometry': {'x': 3.2001, 'y': 6.4601}, 'attributes': {'FID': i, 'DESC_': f'Place {i}'}} for i in range(51)],
        }
        arc = {'operationalLayers': [{'title': title, 'featureCollection': {'layers': [{'featureSet': {'spatialReference': {'wkid': 4326}, 'features': features}}]}} for title, features in layers.items()]}
        osm = '''<osm>
          <node id="1" lon="3.200" lat="6.460"/><node id="2" lon="3.201" lat="6.460"/>
          <node id="3" lon="3.202" lat="6.460"/><node id="4" lon="3.203" lat="6.460"/>
          <node id="5" lon="3.202" lat="6.461"><tag k="barrier" v="gate"/><tag k="access" v="private"/></node>
          <way id="101"><nd ref="1"/><nd ref="2"/><tag k="highway" v="service"/><tag k="access" v="private"/></way>
          <way id="102"><nd ref="2"/><nd ref="3"/><nd ref="5"/><tag k="highway" v="service"/><tag k="access" v="private"/></way>
          <way id="103"><nd ref="3"/><nd ref="4"/><tag k="highway" v="service"/><tag k="access" v="private"/><tag k="foot" v="no"/></way>
        </osm>'''
        with tempfile.TemporaryDirectory() as directory:
            raw = pathlib.Path(directory)
            (raw / 'arcgis.json').write_text(json.dumps(arc), encoding='utf-8')
            (raw / 'osm.xml').write_text(osm, encoding='utf-8')
            with patch.object(import_campus, 'RAW', raw):
                result = import_campus.build(POLICY)
        edges = result['graph']['edges']
        self.assertEqual({e['sourceId'] for e in edges}, {'osm:way:101', 'osm:way:102'})
        self.assertEqual({e['sourceId'] for e in edges if e['from'] == 'osm:node:2'}, {'osm:way:101', 'osm:way:102'})
        self.assertFalse(any('osm:node:5' in [e['from'], e['to']] for e in edges))
        self.assertTrue(all(e['walkingAccess'] == 'campus' for e in edges))
        self.assertTrue(all(e['accessReviewId'] == POLICY['id'] for e in edges))
        source = next(f for f in result['map']['features'] if f['properties']['id'] == 'osm:way:101')
        self.assertEqual(source['properties']['sourceTags']['access'], 'private')
        self.assertEqual(result['coverage']['campusAccessWayCount'], 2)
        self.assertFalse(result['coverage']['fieldVerified'])

        # Rebuild the same source geometry with explicit access reviews. Shared
        # OSM nodes must reconnect; no invented junction or footprint bypass.
        osm = osm.replace('</osm>', '''
          <way id="104"><nd ref="3"/><nd ref="4"/><tag k="highway" v="service"/><tag k="access" v="private"/><tag k="service" v="driveway"/></way>
          <node id="6" lon="3.202" lat="6.462"><tag k="barrier" v="gate"/><tag k="access" v="private"/></node>
          <way id="105"><nd ref="5"/><nd ref="6"/><tag k="highway" v="service"/></way>
        </osm>''')
        with tempfile.TemporaryDirectory() as directory:
            raw = pathlib.Path(directory)
            (raw / 'arcgis.json').write_text(json.dumps(arc), encoding='utf-8')
            (raw / 'osm.xml').write_text(osm, encoding='utf-8')
            with patch.object(import_campus, 'RAW', raw):
                reviewed = import_campus.build(CONNECTION_POLICY)
        reviewed_edges = reviewed['graph']['edges']
        self.assertEqual({e['sourceId'] for e in reviewed_edges}, {'osm:way:101', 'osm:way:102', 'osm:way:104'})
        self.assertTrue(any(e['to'] == 'osm:node:5' for e in reviewed_edges))
        self.assertTrue(any(e['from'] == 'osm:node:5' for e in reviewed_edges))
        self.assertFalse(any('osm:node:6' in [e['from'], e['to']] for e in reviewed_edges))
        driveway = [e for e in reviewed_edges if e['sourceId'] == 'osm:way:104']
        self.assertTrue(all(e['accessReviewId'] == 'law-review' for e in driveway))
        self.assertTrue(any('library-review' in e.get('accessReviewIds', []) for e in reviewed_edges))
        gate = next(n for n in reviewed['graph']['nodes'] if n['id'] == 'osm:node:5')
        self.assertEqual(gate['sourceTags'], {'barrier': 'gate', 'access': 'private'})
        self.assertEqual(gate['accessReviewId'], 'library-review')


if __name__ == '__main__':
    unittest.main()
