"""Repeatable ArcPy exercises on synthetic fixtures, separate from campus data.

Run during the Pro licence window. Results demonstrate tool behavior, not desktop
interaction or surveyed campus geometry. Source geometry and reports are retained.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

from bridge import encoded, now


def glb_summary(path):
    content = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', content)
    if magic != b'glTF' or version != 2 or length != len(content):
        raise ValueError('Invalid exported GLB header.')
    chunk_length, chunk_type = struct.unpack_from('<II', content, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError('Expected a GLB JSON chunk.')
    model = json.loads(content[20:20 + chunk_length].decode('utf-8'))
    return {'file': path.name, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
            'meshes': len(model.get('meshes', [])),
            'materials': [{'name': m.get('name'), 'color': m.get('pbrMetallicRoughness', {}).get('baseColorFactor')}
                          for m in model.get('materials', [])],
            'positionBounds': [{'min': a.get('min'), 'max': a.get('max')} for a in model.get('accessors', [])
                               if a.get('type') == 'VEC3' and a.get('min') is not None]}


def study(output):
    import arcpy
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    database = str(arcpy.management.CreateFileGDB(str(output), 'SyntheticWorkflows.gdb').getOutput(0))
    sr = arcpy.SpatialReference(32631)
    origin = (500000, 715000)
    results = []
    def polygon(points):
        return arcpy.Polygon(arcpy.Array([arcpy.Point(origin[0] + x, origin[1] + y) for x, y in points]), sr)
    def feature(name, geometry):
        return str(arcpy.management.CopyFeatures([geometry], str(Path(database) / name)).getOutput(0))
    def geometry(path):
        with arcpy.da.SearchCursor(path, ['SHAPE@']) as rows:
            return next(rows)[0]
    def run(name, operation):
        try:
            result = {'task': name, 'status': 'passed', **operation()}
        except Exception as error:
            result = {'task': name, 'status': 'failed', 'error': str(error)[:2000]}
        results.append(result)
        (output / 'results.json').write_bytes(encoded({
            'schemaVersion': 1, 'createdAt': now(), 'syntheticOnly': True,
            'proVersion': arcpy.GetInstallInfo().get('Version'), 'licence': arcpy.ProductInfo(),
            'tasks': results, 'limitations': ['ArcPy API study; does not demonstrate desktop pointer or keyboard interaction.',
                                            'No fixture is a campus measurement or publication candidate.']}))
        print(json.dumps(result), flush=True)
    rectangle = polygon([(0, 0), (0, 8), (12, 8), (12, 0), (0, 0)])
    footprint = feature('PreciseRectangle', rectangle)
    def precision():
        assert abs(rectangle.area - 96) < .001
        assert abs(rectangle.length - 40) < .001
        return {'widthM': 12, 'depthM': 8, 'areaM2': rectangle.area, 'crs': 'EPSG:32631',
                'source': 'arcpy.Polygon with explicit projected metre coordinates'}
    run('precise-footprint', precision)
    def snap():
        line = arcpy.Polyline(arcpy.Array([arcpy.Point(origin[0], origin[1]), arcpy.Point(origin[0] + 12, origin[1])]), sr)
        reference = feature('SnapReference', line)
        checks = []
        for mode, x, expected in [('EDGE', 6, 6), ('VERTEX', .2, 0), ('END', 11.8, 12)]:
            point = feature('Snap_' + mode, arcpy.PointGeometry(arcpy.Point(origin[0] + x, origin[1] + .2), sr))
            arcpy.edit.Snap(point, [[reference, mode, '0.5 Meters']])
            saved = geometry(point).firstPoint
            error = math.hypot(saved.X - origin[0] - expected, saved.Y - origin[1])
            assert error < .001
            checks.append({'mode': mode, 'toleranceM': .5, 'errorM': error})
        return {'tool': 'arcpy.edit.Snap', 'checks': checks,
                'lesson': 'Snap modifies its input; TurnRight needs a cancellable draft/preview before commit.'}
    run('reference-snapping', snap)
    def trace():
        courtyard = rectangle.difference(polygon([(3, 2), (3, 5), (7, 5), (7, 2), (3, 2)]))
        boundary = courtyard.boundary()
        feature('CourtyardBoundary', boundary)
        feature('Courtyard', courtyard)
        assert abs(courtyard.area - 84) < .001
        assert abs(boundary.length - 54) < .001
        assert boundary.partCount == 2
        return {'tool': 'Geometry.boundary', 'rings': boundary.partCount, 'lengthM': boundary.length,
                'lesson': 'Choose the intended outer or inner ring explicitly; tracing does not imply routing connectivity.'}
    run('trace-boundary-with-hole', trace)
    def square():
        status = arcpy.CheckOutExtension('3D')
        if status != 'CheckedOut':
            raise RuntimeError('3D Analyst checkout unavailable: ' + status)
        try:
            rough = feature('RoughFootprint', polygon([(0, 0), (.15, 8), (12, 8.2), (12.1, -.1), (0, 0)]))
            target = str(Path(database) / 'SquaredFootprint')
            arcpy.ddd.RegularizeBuildingFootprint(rough, target, method='RIGHT_ANGLES',
                                                  tolerance=.5, densification=.25, precision=.1)
            with arcpy.da.SearchCursor(target, ['STATUS', 'SHAPE@']) as rows:
                state, shape = next(rows)
            assert state == 0, 'Pro retained the original polygon instead of regularizing it.'
            return {'tool': 'arcpy.ddd.RegularizeBuildingFootprint', 'statusField': state,
                    'toleranceM': .5, 'beforeAreaM2': geometry(rough).area, 'afterAreaM2': shape.area,
                    'lesson': 'Inspect STATUS and preview deviations; a returned feature is not proof of successful regularization.'}
        finally:
            arcpy.CheckInExtension('3D')
    run('square-building', square)
    def model_export():
        models = output / 'source-models'
        models.mkdir()
        # A deliberately simple synthetic gabled building: OBJ Z is height, units metres.
        vertices = [(0, 0, 0), (12, 0, 0), (12, 8, 0), (0, 8, 0),
                    (0, 0, 6), (12, 0, 6), (12, 8, 6), (0, 8, 6), (0, 4, 8), (12, 4, 8)]
        obj = ['mtllib synthetic.mtl', 'o synthetic_building']
        obj += ['v ' + ' '.join(map(str, vertex)) for vertex in vertices]
        obj += ['usemtl facade', 'f 1 4 3 2', 'f 1 2 6 5', 'f 4 8 7 3', 'f 1 5 9 8 4', 'f 2 3 7 10 6',
                'usemtl roof', 'f 5 6 10 9', 'f 9 10 7 8']
        (models / 'synthetic.obj').write_text('\n'.join(obj) + '\n', encoding='utf-8')
        (models / 'synthetic.mtl').write_text('newmtl facade\nKd 0.8 0.7 0.5\nnewmtl roof\nKd 0.2 0.3 0.4\n', encoding='utf-8')
        target = str(Path(database) / 'SyntheticModel')
        arcpy.management.Import3DObjects(str(models / 'synthetic.obj'), target,
                                         update='ADD_ALL', translate='0 0', elevation=0, scale=1, rotate=0, y_is_up='Z_IS_UP')
        exports = output / 'exported-glb'
        exports.mkdir()
        arcpy.management.Export3DObjects(target, str(exports), ['FMT3D_GLB'], overwrite='NO_OVERWRITE')
        files = list(exports.rglob('*.glb'))
        assert files, 'No GLB was exported.'
        summaries = [glb_summary(path) for path in files]
        assert all(summary['meshes'] for summary in summaries)
        (output / 'model-placement.json').write_bytes(encoded({
            'classification': 'synthetic-test-fixture', 'units': 'metre', 'sourceUpAxis': 'Z', 'glbUpAxis': 'Y',
            'sourceDimensionsM': [12, 8, 8], 'campusPlacement': None,
            'note': 'No geographic placement established; never insert at a real campus without an explicit placement review.'}))
        return {'tools': ['Import3DObjects', 'Export3DObjects'], 'exports': summaries,
                'lesson': 'Verify units, axes, materials and placement after export; this is not a roof-editing UI observation.'}
    run('roof-facade-glb-portability', model_export)
    results.append({'task': 'batch-appearance-desktop', 'status': 'pending-interactive-observation',
                    'reason': 'ArcPy export proves file portability, not selection, preview, cancellation or undo in the Pro UI.'})
    # Preserve every geometry without requiring a geodatabase reader after expiry.
    with arcpy.EnvManager(workspace=database):
        for name in arcpy.ListFeatureClasses():
            if arcpy.Describe(name).shapeType == 'MultiPatch':
                continue
            arcpy.conversion.FeaturesToJSON(name, str(output / (name + '.geojson')), geoJSON='GEOJSON', outputToWGS84='WGS84')
    (output / 'results.json').write_bytes(encoded({'schemaVersion': 1, 'createdAt': now(), 'syntheticOnly': True,
        'proVersion': arcpy.GetInstallInfo().get('Version'), 'licence': arcpy.ProductInfo(), 'tasks': results,
        'limitations': ['ArcPy API exercise, not desktop interaction evidence.', 'Synthetic geometry is not campus data.']}))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    results = study(args.output)
    raise SystemExit(1 if any(result['status'] == 'failed' for result in results) else 0)
