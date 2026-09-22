import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from campus_access import vehicle_rules, node_blocks_vehicle


class DrivingAccessTests(unittest.TestCase):
    def test_walking_permission_does_not_authorize_cars(self):
        self.assertEqual(vehicle_rules({'highway': 'service', 'access': 'private', 'foot': 'yes'})['access'], 'private')
        self.assertEqual(vehicle_rules({'highway': 'footway', 'foot': 'yes'})['access'], 'no')
        self.assertEqual(vehicle_rules({'highway': 'steps', 'motorcar': 'yes'})['access'], 'no')

    def test_specific_vehicle_permissions_and_restrictions(self):
        self.assertEqual(vehicle_rules({'highway': 'service', 'access': 'private', 'motorcar': 'yes'})['access'], 'yes')
        self.assertEqual(vehicle_rules({'highway': 'service', 'motor_vehicle': 'no'})['access'], 'no')
        self.assertTrue(vehicle_rules({'highway': 'service', 'access:conditional': 'yes @ (08:00-10:00)'})['conditional'])

    def test_direction_roundabouts_and_estimated_speed(self):
        self.assertEqual(vehicle_rules({'highway': 'service', 'oneway': '-1'})['direction'], 'reverse')
        self.assertEqual(vehicle_rules({'highway': 'service', 'junction': 'roundabout'})['direction'], 'forward')
        self.assertEqual(vehicle_rules({'highway': 'service', 'junction': 'roundabout', 'oneway': 'no'})['direction'], 'both')
        self.assertTrue(vehicle_rules({'highway': 'service', 'oneway': 'reversible'})['conditional'])
        self.assertTrue(vehicle_rules({'highway': 'service', 'service': 'parking_aisle'})['parkingAisle'])
        self.assertAlmostEqual(vehicle_rules({'highway': 'residential', 'maxspeed': '20 mph'})['speedKph'], 32.18688)
        self.assertNotIn('speedKph', vehicle_rules({'highway': 'service', 'maxspeed': 'signals'}))

    def test_vehicle_barriers_are_independent_of_foot_access(self):
        for barrier in ['bollard', 'gate', 'stile', 'wall', 'cycle_barrier']:
            self.assertTrue(node_blocks_vehicle({'barrier': barrier, 'foot': 'yes'}))
        self.assertFalse(node_blocks_vehicle({'barrier': 'gate', 'motor_vehicle': 'yes'}))
        self.assertTrue(node_blocks_vehicle({'barrier': 'gate', 'motor_vehicle': 'yes', 'locked': 'yes'}))


if __name__ == '__main__':
    unittest.main()
