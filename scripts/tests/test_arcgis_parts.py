import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from import_campus import arc_geometry
from spatial import blocker

class ArcGisPartsTests(unittest.TestCase):
    def test_disjoint_wings_and_courtyard(self):
        first = [[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]
        hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
        second = [[6, 0], [6, 2], [8, 2], [8, 0], [6, 0]]
        geometry = arc_geometry({'rings': [first, second, hole]}, 4326)
        self.assertEqual(geometry['type'], 'MultiPolygon')
        self.assertEqual(geometry['coordinates'], [[first, hole], [second]])
        features = [{'geometry': geometry, 'properties': {'kind': 'building', 'id': 'campus-wing'}}]
        self.assertEqual(blocker([5, 1], [9, 1], features), 'building:campus-wing')
        self.assertIsNone(blocker([1.5, 2], [2.5, 2], features))
        self.assertIsNone(blocker([4.5, 0], [4.5, 4], features))

    def test_single_footprint_remains_readable(self):
        ring = [[3, 6], [3, 7], [4, 7], [4, 6], [3, 6]]
        self.assertEqual(arc_geometry({'rings': [ring]}, 4326), {'type': 'Polygon', 'coordinates': [ring]})

if __name__ == '__main__': unittest.main()
