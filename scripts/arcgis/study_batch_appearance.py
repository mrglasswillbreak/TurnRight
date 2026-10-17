"""Exercise selected-feature appearance with ArcPy on new synthetic copies only.

The saved layer and GeoJSON preserve the result after the Pro licence expires.
This is an API exercise, not evidence of pointer interaction or desktop undo.
"""
import argparse
import hashlib
import json
from pathlib import Path

from bridge import encoded, now


def study(output):
    import arcpy
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    database = str(arcpy.management.CreateFileGDB(str(output), 'Appearance.gdb').getOutput(0))
    source = str(Path(database) / 'OriginalBuildings')
    arcpy.management.CreateFeatureclass(database, 'OriginalBuildings', 'POLYGON',
                                         spatial_reference=arcpy.SpatialReference(32631))
    arcpy.management.AddField(source, 'StableID', 'TEXT', field_length=16)
    arcpy.management.AddField(source, 'Palette', 'TEXT', field_length=24)
    with arcpy.da.InsertCursor(source, ['StableID', 'Palette', 'SHAPE@']) as rows:
        for i in range(3):
            x, y = 500000 + i * 20, 715000
            points = [(x, y), (x, y + 8), (x + 12, y + 8), (x + 12, y), (x, y)]
            shape = arcpy.Polygon(arcpy.Array([arcpy.Point(*point) for point in points]),
                                  arcpy.SpatialReference(32631))
            rows.insertRow((f'fixture-{i + 1}', 'original', shape))

    def snapshot(dataset):
        with arcpy.da.SearchCursor(dataset, ['StableID', 'Palette', 'SHAPE@JSON']) as rows:
            return {identity: {'palette': palette, 'geometry': json.loads(shape)}
                    for identity, palette, shape in rows}

    before = snapshot(source)
    preview = str(arcpy.management.CopyFeatures(source, str(Path(database) / 'AppearancePreview')).getOutput(0))
    layer = arcpy.management.MakeFeatureLayer(preview, 'Synthetic appearance preview').getOutput(0)
    field = arcpy.AddFieldDelimiters(preview, 'StableID')
    arcpy.management.SelectLayerByAttribute(layer, 'NEW_SELECTION',
                                            f"{field} IN ('fixture-1', 'fixture-2')")
    assert int(arcpy.management.GetCount(layer).getOutput(0)) == 2
    arcpy.management.CalculateField(layer, 'Palette', "'terracotta'", 'PYTHON3')
    arcpy.management.SelectLayerByAttribute(layer, 'CLEAR_SELECTION')
    changed = snapshot(preview)
    assert snapshot(source) == before
    assert all(changed[key]['geometry'] == value['geometry'] for key, value in before.items())
    assert {key for key, value in changed.items() if value['palette'] == 'terracotta'} == {'fixture-1', 'fixture-2'}
    assert changed['fixture-3']['palette'] == 'original'

    colours = {'original': [206, 213, 209, 100], 'terracotta': [227, 213, 188, 100]}
    layer_path = output / 'appearance-preview.lyrx'
    arcpy.management.SaveToLayerFile(layer, str(layer_path), 'RELATIVE')
    layer_file = arcpy.mp.LayerFile(str(layer_path))
    saved_layer = layer_file.listLayers()[0]
    symbology = saved_layer.symbology
    symbology.updateRenderer('UniqueValueRenderer')
    symbology.renderer.fields = ['Palette']
    for group in symbology.renderer.groups:
        for item in group.items:
            item.symbol.color = {'RGB': colours[item.values[0][0]]}
    saved_layer.symbology = symbology
    layer_file.save()
    reopened = arcpy.mp.LayerFile(str(layer_path)).listLayers()[0]
    actual = {item.values[0][0]: item.symbol.color['RGB']
              for group in reopened.symbology.renderer.groups for item in group.items}
    assert actual == colours
    for name, dataset in [('original', source), ('appearance-preview', preview)]:
        arcpy.conversion.FeaturesToJSON(dataset, str(output / (name + '.geojson')),
                                        geoJSON='GEOJSON', outputToWGS84='WGS84')
    (output / 'palettes.json').write_bytes(encoded({'classification': 'synthetic-illustrative',
        'field': 'Palette', 'coloursRGBA': colours, 'selectedIDs': ['fixture-1', 'fixture-2']}))
    report = {'schemaVersion': 1, 'createdAt': now(), 'syntheticOnly': True,
        'proVersion': arcpy.GetInstallInfo().get('Version'), 'licence': arcpy.ProductInfo(),
        'task': 'batch-appearance-api', 'status': 'passed', 'features': 3, 'selectedFeatures': 2,
        'originalUnchanged': snapshot(source) == before, 'geometryUnchanged': True,
        'savedRenderer': 'UniqueValueRenderer', 'reopenedColoursRGBA': actual,
        'source': 'https://doc.esri.com/en/arcgis-pro/latest/arcpy/mapping/uniquevaluerenderer-class.html',
        'limitations': ['API styling on synthetic copies, not a campus import.',
                       'Desktop preview, cancellation and undo remain unobserved.'],
        'exports': [{'file': p.name, 'bytes': p.stat().st_size,
                     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                    for p in sorted(output.iterdir()) if p.is_file()]}
    (output / 'results.json').write_bytes(encoded(report))
    print(json.dumps(report), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    study(parser.parse_args().output)
