"""File inspection. Invoked in a network-disabled GIS container by the worker."""
import csv
import json
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath

MAX_EXPANDED = 250 * 1024 * 1024
MAX_FEATURES = 100000
DRIVERS = ['GeoJSON', 'ESRI Shapefile', 'GPKG', 'LIBKML', 'KML', 'GPX', 'CSV', 'ESRIJSON']


def unpack(path, directory):
    with zipfile.ZipFile(path) as archive:
        files = archive.infolist()
        if len(files) > 2000 or sum(f.file_size for f in files) > MAX_EXPANDED:
            raise ValueError('Archive exceeds the expanded import limit.')
        seen = set()
        for item in files:
            parts = PurePosixPath(item.filename.replace('\\','/'))
            if parts.is_absolute() or '..' in parts.parts or ':' in str(parts) or '\x00' in item.filename or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('Archive contains an unsafe path or symbolic link.')
            if str(parts).lower() in seen:
                raise ValueError('Archive contains duplicate file names.')
            seen.add(str(parts).lower())
        archive.extractall(directory)
    return sorted(p for p in Path(directory).rglob('*') if p.is_file())


def safe_xml(path):
    content = path.read_bytes()
    # Also check UTF-16/32 documents, before handing them to a native driver.
    flat = content.replace(b'\x00',b'').lower()
    if b'<!doctype' in flat or b'<!entity' in flat or b'<networklink' in flat:
        raise ValueError('External XML entities and KML network links are not supported.')


def guess_role(name, types, properties=None):
    text = name.lower()
    tags = properties or {}
    if tags.get('building') or 'building' in text or 'footprint' in text: return 'building'
    if tags.get('highway') or any(v in text for v in ['road','path','track','route']): return 'path'
    if tags.get('barrier') or 'barrier' in text: return 'barrier'
    if tags.get('entrance') or 'entrance' in text: return 'entrance'
    if 'boundary' in text: return 'boundary'
    if 'Point' in types: return 'place'
    if any('Polygon' in t for t in types): return 'landcover'
    return 'skip'


def inspect_file(path, configuration, work, label=None):
    from osgeo import gdal, osr
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in ('.osm','.xml'):
        safe_xml(path)
    if suffix == '.xml':
        import xml.etree.ElementTree as ET
        with path.open('rb') as stream:
            root = next(ET.iterparse(stream, events=('start',)))[1]
            if root.tag != 'osm': raise ValueError('XML uploads must contain OpenStreetMap data.')
        osm_path = Path(work) / (path.stem + '.osm')
        osm_path.parent.mkdir(parents=True, exist_ok=True)
        osm_path.write_bytes(path.read_bytes())
        path, suffix = osm_path, '.osm'
    if suffix in ('.osm','.pbf'):
        from .osm import inspect_osm
        return inspect_osm(path)
    if suffix in ('.zip','.kmz'):
        files = unpack(path,Path(work)/path.stem)
        targets = [p for p in files if p.suffix.lower() == ('.kml' if suffix == '.kmz' else '.shp')]
        if not targets: raise ValueError('Archive contains no supported vector dataset.')
        results = []
        for target in targets:
            if target.suffix.lower() == '.shp':
                companions = {p.suffix.lower() for p in files if p.stem.lower() == target.stem.lower() and p.parent == target.parent}
                if not {'.shp','.shx','.dbf'}.issubset(companions): raise ValueError('Shapefile needs matching .shp, .shx and .dbf files.')
            results.extend(inspect_file(target,configuration,work))
        return results
    if suffix in ('.kml','.gpx','.xml'): safe_xml(path)
    mappings = {m['layer']:m for m in configuration.get('layers',[])}
    if suffix == '.csv':
        with path.open(encoding='utf-8-sig',newline='') as stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames: raise ValueError('CSV needs a header row.')
            rows = []
            for row in reader:
                if len(rows) >= MAX_FEATURES: raise ValueError('CSV exceeds the feature limit.')
                rows.append(row)
        name = label or path.stem
        mapping = mappings.get(name,{})
        x,y = mapping.get('longitudeField'),mapping.get('latitudeField')
        features = []
        for index,row in enumerate(rows):
            geom = None
            if x and y:
                try: geom = {'type':'Point','coordinates':[float(row[x]),float(row[y])]}
                except (KeyError,TypeError,ValueError): raise ValueError(f'CSV row {index+2} has invalid coordinates.')
            features.append({'type':'Feature','id':index,'geometry':geom,'properties':row})
        return [{'name':name,'features':features,'fields':[{'name':f} for f in reader.fieldnames],'crs':mapping.get('crs'),'geometryTypes':['Point'],'suggestedRole':'place','requiresCoordinates':True}]
    gdal.UseExceptions()
    gdal.SetConfigOption('OGR_SQLITE_LOAD_EXTENSIONS','')
    gdal.SetConfigOption('OGR_SQLITE_LIST_VIRTUAL_OGR','NO')
    dataset = gdal.OpenEx(str(path.resolve()),gdal.OF_VECTOR,allowed_drivers=DRIVERS)
    if dataset is None: raise ValueError('Unsupported or damaged vector dataset.')
    result = []
    target = osr.SpatialReference(); target.ImportFromEPSG(4326); target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    total = 0
    for index in range(dataset.GetLayerCount()):
        layer = dataset.GetLayerByIndex(index)
        name = label if label and dataset.GetLayerCount() == 1 else layer.GetName()
        mapping = mappings.get(name,{})
        spatial = layer.GetSpatialRef()
        if mapping.get('crs'):
            spatial = osr.SpatialReference()
            if not re.fullmatch(r'(?:EPSG:)?[0-9]{3,7}',mapping['crs'],re.I): raise ValueError('Choose a valid EPSG coordinate reference system.')
            spatial.ImportFromEPSG(int(mapping['crs'].split(':')[-1]))
        transform = None
        if spatial:
            spatial.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            transform = osr.CoordinateTransformation(spatial,target)
        definition = layer.GetLayerDefn()
        fields = [{'name':definition.GetFieldDefn(i).GetName()} for i in range(definition.GetFieldCount())]
        features, types = [], set()
        for record in layer:
            total += 1
            if total > MAX_FEATURES: raise ValueError('Import exceeds 100,000 features; select a smaller dataset.')
            props = {field['name']:record.GetField(field['name']) for field in fields}
            geometry = record.GetGeometryRef()
            if geometry:
                geometry = geometry.Clone()
                geometry.FlattenTo2D()
                if transform: geometry.Transform(transform)
                geometry = json.loads(geometry.ExportToJson())
                types.add(geometry['type'])
            features.append({'type':'Feature','id':record.GetFID(),'geometry':geometry,'properties':props})
        result.append({'name':name,'features':features,'fields':fields,'crs':'EPSG:4326' if spatial else None,'geometryTypes':sorted(types),'suggestedRole':guess_role(name,types)})
    return result
