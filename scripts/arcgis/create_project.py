"""Create an isolated Pro project from a local template without changing it."""
import argparse
import json
import shutil
from pathlib import Path
import arcpy

def create(template, evidence, output, resume=False):
    output = Path(output).resolve()
    receipt = output.with_suffix('.turnright-project.json')
    if output.exists() and not resume:
        raise ValueError('Choose a new project path to preserve previous analysis.')
    if resume:
        owner = json.loads(receipt.read_bytes()) if receipt.is_file() else {}
        if owner.get('generator') != 'turnright-arcgis-pro' or owner.get('status') != 'creating' or owner.get('project') != str(output):
            raise ValueError('Resume is limited to an interrupted project created by this script. Choose a new project path.')
    elif receipt.exists():
        raise ValueError('An earlier project receipt exists here. Choose a new project path.')
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.exists():
        source = arcpy.mp.ArcGISProject(str(Path(template).resolve()))
        source.saveACopy(str(output))
        receipt.write_text(json.dumps({'generator': 'turnright-arcgis-pro', 'status': 'creating', 'project': str(output)}), encoding='utf-8')
    project = arcpy.mp.ArcGISProject(str(output))
    for view in project.listMaps(): project.deleteItem(view)
    gdb = output.parent / 'CampusDetail.gdb'
    if not gdb.exists(): arcpy.management.CreateFileGDB(str(output.parent), gdb.name)
    arcpy.env.overwriteOutput = True
    project.defaultGeodatabase = str(gdb)
    for slug, name in [('lasu', 'LASU Ojo'), ('unilag', 'UNILAG Akoka')]:
        folder = Path(evidence).resolve() / slug
        baseline = json.loads((folder / 'baseline.json').read_bytes())
        maps = [project.createMap(name + ' · source review', 'MAP'), project.createMap(name + ' · 3D review', 'SCENE')]
        for view in maps:
            view.spatialReference = arcpy.SpatialReference(4326)
            view.defaultCamera.setExtent(arcpy.Extent(*baseline['bounds'][0], *baseline['bounds'][1]))
        features = [f for f in baseline['map']['features'] if f.get('properties', {}).get('kind') == 'building']
        footprint = folder / 'project-footprints.geojson'
        # Complex application metadata is retained in baseline.json, not flattened into GIS fields.
        footprint.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{**f, 'properties': {k: f['properties'].get(k) for k in ['id', 'name', 'height', 'floors', 'source']}} for f in features]}), encoding='utf-8')
        target = str(gdb / (slug + '_baseline_buildings'))
        arcpy.conversion.JSONToFeatures(str(footprint), target, 'POLYGON')
        for view in maps: view.addDataFromPath(target)
        inspection = json.loads((folder / 'inspection.json').read_bytes())
        for index, layer in enumerate(inspection['layers']):
            path = folder / layer['file']
            raw = json.loads(path.read_bytes())
            if not raw['features']: continue
            geometry = next((f['geometry']['type'] for f in raw['features'] if f.get('geometry')), None)
            if geometry is None: continue
            kind = 'POLYGON' if 'Polygon' in geometry else 'POLYLINE' if 'Line' in geometry else 'POINT'
            target = str(gdb / f'{slug}_candidate_{index}')
            try:
                arcpy.conversion.JSONToFeatures(str(path), target, kind)
                added = maps[0].addDataFromPath(target)
                added.name = layer['name'] + ' [candidate; rights/date review]'
                added.visible = False
            except arcpy.ExecuteError:
                print('Candidate conversion needs manual review:', slug, layer['name'])
    toolbox = output.parent / 'TurnRightAnalysis.atbx'
    if not toolbox.exists(): shutil.copy2(project.defaultToolbox, toolbox)
    project.updateToolboxes([{'toolboxPath': str(toolbox), 'isDefaultToolbox': True}, {'toolboxPath': str(Path(__file__).with_name('TurnRight.pyt').resolve()), 'isDefaultToolbox': False}])
    project.save()
    receipt.write_text(json.dumps({'generator': 'turnright-arcgis-pro', 'status': 'complete', 'project': str(output)}), encoding='utf-8')
    print(str(output))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', required=True)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--resume', action='store_true', help='Rebuild a project previously created by this script after an interrupted run.')
    args = parser.parse_args()
    create(args.template, args.evidence, args.output, args.resume)
