"""File inspection. Invoked in a network-disabled GIS container by the worker."""
import csv
import json
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

MAX_EXPANDED = 250 * 1024 * 1024
MAX_FEATURES = 100000
CAPABILITIES = json.loads((Path(__file__).with_name('capabilities.json')).read_text())
DRIVERS = sorted({driver for capability in CAPABILITIES for driver in capability['drivers']})
SIDECARS = {'.shx','.dbf','.prj','.cpg','.dat','.map','.id','.mid','.xsd'}


def check_expanded_batch(paths, limit=MAX_EXPANDED):
    total = 0
    for path in paths:
        path = Path(path)
        if path.suffix.lower() in ('.zip','.kmz'):
            with zipfile.ZipFile(path) as archive:
                total += sum(item.file_size for item in archive.infolist())
        else:
            total += path.stat().st_size
        if total > limit:
            raise ValueError('The combined expanded upload batch exceeds 250 MiB. Import smaller batches.')


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
    if path.suffix.lower() == '.kml':
        for element in ET.fromstring(content).iter():
            tag = element.tag.rsplit('}',1)[-1].lower()
            if tag not in ('href','styleurl') or not element.text: continue
            value = element.text.strip().replace('\\','/')
            if urlsplit(value).scheme or value.startswith('/') or '..' in PurePosixPath(value).parts:
                raise ValueError('External KML references are not supported. Include local styles in the supplied file.')


def guess_role(name, types, properties=None):
    text = name.lower()
    tags = properties or {}
    if tags.get('building') or 'building' in text or 'footprint' in text: return 'building'
    if tags.get('highway') or any(v in text for v in ['road','path','track','route']):
        return 'road-surface' if any('Polygon' in t for t in types) else 'path'
    if tags.get('barrier') or 'barrier' in text: return 'barrier'
    if tags.get('entrance') or 'entrance' in text: return 'entrance'
    if 'boundary' in text: return 'boundary'
    if 'Point' in types or 'MultiPoint' in types: return 'place'
    if any('Polygon' in t for t in types) and any(v in text for v in ('land','green','parcel','water','vegetation')): return 'landcover'
    return 'overlay'


def check_json_export(path):
    content = Path(path).read_text(encoding='utf-8-sig')
    try: value = json.loads(content)
    except json.JSONDecodeError:
        lines = [line.lstrip('\x1e') for line in content.splitlines() if line.strip('\x1e \t')]
        if lines and all(json.loads(line).get('type') == 'Feature' for line in lines): return 'GeoJSONSeq'
        raise ValueError('JSON is damaged or does not contain a GeoJSON sequence.')
    if not isinstance(value, dict):
        raise ValueError('Choose a GeoJSON Feature/FeatureCollection or an ArcGIS feature response.')
    properties = value.get('properties') or {}
    if value.get('exceededTransferLimit') or (isinstance(properties, dict) and properties.get('exceededTransferLimit')):
        raise ValueError('This export is truncated (exceededTransferLimit). Download every object-ID batch or import the ArcGIS layer URL, then upload the complete file. Nothing was imported.')
    if value.get('error'):
        raise ValueError('This file contains an ArcGIS error response rather than map features. Download the layer again.')
    if value.get('type') == 'Topology': return 'TopoJSON'
    # ArcGIS snapshots put records before their schema. GDAL's short header
    # probe can see "features" but miss geometryType and incorrectly choose
    # GeoJSON. Select the JSON dialect from the parsed document, not key order.
    if str(value.get('geometryType', '')).startswith('esriGeometry') or value.get('objectIdFieldName'):
        return 'ESRIJSON'
    features = value.get('features')
    if isinstance(features, list) and any(isinstance(f, dict) and 'attributes' in f for f in features):
        return 'ESRIJSON'
    return 'GeoJSON'


def inspect_file(path, configuration, work, label=None):
    path = Path(path)
    suffix = path.suffix.lower()
    json_driver = None
    if suffix in ('.json', '.geojson', '.topojson'):
        json_driver = check_json_export(path)
    from osgeo import gdal, osr
    if suffix == '.shp':
        companions = {p.suffix.lower() for p in path.parent.iterdir() if p.stem.lower()==path.stem.lower()}
        if not {'.shp','.shx','.dbf'}.issubset(companions): raise ValueError('Shapefile needs matching .shp, .shx and .dbf files.')
    if suffix in ('.osm','.xml'):
        safe_xml(path)
    if suffix == '.xml':
        import xml.etree.ElementTree as ET
        with path.open('rb') as stream:
            root = next(ET.iterparse(stream, events=('start',)))[1]
            is_osm = root.tag == 'osm'
        if is_osm:
            osm_path = Path(work) / (path.stem + '.osm')
            osm_path.parent.mkdir(parents=True, exist_ok=True)
            osm_path.write_bytes(path.read_bytes())
            path, suffix = osm_path, '.osm'
        else: json_driver = 'GML'
    if suffix in ('.osm','.pbf'):
        from .osm import inspect_osm
        return inspect_osm(path)
    if suffix in ('.zip','.kmz'):
        files = unpack(path,Path(work)/path.stem)
        geodatabases = sorted({parent for p in files for parent in p.parents if parent.suffix.lower()=='.gdb'})
        known = {'.'+ext for capability in CAPABILITIES for ext in capability['extensions']}
        targets = [p for p in files if p.suffix.lower() in ({'.kml'} if suffix == '.kmz' else known - SIDECARS - {'.zip','.kmz'}) and not any(g in p.parents for g in geodatabases)] + geodatabases
        if not targets: raise ValueError('Archive contains no supported vector dataset.')
        results = []
        for target in targets:
            if target.suffix.lower() == '.shp':
                companions = {p.suffix.lower() for p in files if p.stem.lower() == target.stem.lower() and p.parent == target.parent}
                if not {'.shp','.shx','.dbf'}.issubset(companions): raise ValueError('Shapefile needs matching .shp, .shx and .dbf files.')
            dataset_label = target.relative_to(Path(work)/path.stem).as_posix()
            results.extend(inspect_file(target,configuration,work,dataset_label))
        return results
    if suffix in SIDECARS: return []
    if suffix in ('.kml','.gpx','.xml','.gml'): safe_xml(path)
    if suffix in ('.geojsonl','.geojsons','.jsonl','.ndjson'): json_driver = 'GeoJSONSeq'
    mappings = {m['layer']:m for m in configuration.get('layers',[])}
    if suffix in ('.parquet','.geoparquet'):
        import pyarrow.parquet as pq
        from shapely import from_wkb
        from shapely.geometry import mapping as geometry_mapping
        from shapely.ops import transform as shape_transform
        from pyproj import CRS, Transformer
        parquet = pq.ParquetFile(path)
        if parquet.metadata.num_rows > MAX_FEATURES: raise ValueError('GeoParquet exceeds the feature limit.')
        metadata = parquet.schema_arrow.metadata or {}
        if b'geo' not in metadata: raise ValueError('Parquet has no GeoParquet geometry metadata.')
        geo = json.loads(metadata[b'geo']); column = geo['primary_column']; definition = geo['columns'][column]
        if definition.get('encoding') != 'WKB': raise ValueError('Export GeoParquet geometry using WKB encoding.')
        name = label or path.stem
        crs = mappings.get(name,{}).get('crs') or definition.get('crs', 'OGC:CRS84')
        projection = CRS.from_user_input(crs) if crs else None
        operation = Transformer.from_crs(projection,'EPSG:4326',always_xy=True).transform if projection else None
        features = []
        for batch in parquet.iter_batches(batch_size=1000):
            for row in batch.to_pylist():
                raw = row.pop(column)
                geometry = from_wkb(raw) if raw is not None else None
                if geometry is not None and operation: geometry = shape_transform(operation,geometry)
                features.append({'type':'Feature','id':None,'geometry':geometry_mapping(geometry) if geometry is not None else None,'properties':json.loads(json.dumps(row,default=str))})
        types = sorted({f['geometry']['type'] for f in features if f['geometry']})
        return [{'name':name,'features':features,'fields':[{'name':f} for f in parquet.schema_arrow.names if f!=column],'crs':'EPSG:4326' if projection else None,'sourceCrs':projection.to_string() if projection else None,'geometryTypes':types,'suggestedRole':guess_role(name,types),'format':'GeoParquet (WKB)'}]
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
        aliases = {name.lower():name for name in reader.fieldnames}
        x = x or next((aliases[n] for n in ('longitude','lon','lng') if n in aliases),None)
        y = y or next((aliases[n] for n in ('latitude','lat') if n in aliases),None)
        wkt = mapping.get('geometryField') or aliases.get('wkt')
        features = []
        for index,row in enumerate(rows):
            geom = None
            if wkt:
                from shapely import from_wkt
                from shapely.geometry import mapping as geometry_mapping
                try: geom = geometry_mapping(from_wkt(row[wkt]))
                except Exception as error: raise ValueError(f'CSV row {index+2} has invalid WKT geometry.') from error
            elif x and y:
                try: geom = {'type':'Point','coordinates':[float(row[x]),float(row[y])]}
                except (KeyError,TypeError,ValueError): raise ValueError(f'CSV row {index+2} has invalid coordinates.')
            features.append({'type':'Feature','id':index,'geometry':geom,'properties':row})
        types = sorted({f['geometry']['type'] for f in features if f.get('geometry')}) or ['Point']
        crs = mapping.get('crs') or ('EPSG:4326' if x and y and not wkt else None)
        return [{'name':name,'features':features,'fields':[{'name':f} for f in reader.fieldnames],'crs':crs,'geometryTypes':types,'suggestedRole':guess_role(name,types),'requiresCoordinates':not bool(x and y or wkt),'format':'CSV'}]
    gdal.UseExceptions()
    gdal.SetConfigOption('OGR_SQLITE_LOAD_EXTENSIONS','')
    gdal.SetConfigOption('OGR_SQLITE_LIST_VIRTUAL_OGR','NO')
    source = f'{json_driver}:{path.resolve()}' if json_driver else str(path.resolve())
    dataset = gdal.OpenEx(source,gdal.OF_VECTOR,allowed_drivers=[json_driver] if json_driver else DRIVERS)
    if dataset is None: raise ValueError('Unsupported or damaged vector dataset.')
    result = []
    target = osr.SpatialReference(); target.ImportFromEPSG(4326); target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    total = 0
    for index in range(dataset.GetLayerCount()):
        layer = dataset.GetLayerByIndex(index)
        name = label if label and dataset.GetLayerCount() == 1 else (label + ' / ' if label else '') + layer.GetName()
        if name not in mappings and layer.GetName() in mappings: name = layer.GetName()
        mapping = mappings.get(name,{})
        spatial = layer.GetSpatialRef()
        if mapping.get('crs'):
            spatial = osr.SpatialReference()
            if not re.fullmatch(r'(?:EPSG:)?[0-9]{3,7}',mapping['crs'],re.I): raise ValueError('Choose a valid EPSG coordinate reference system.')
            spatial.ImportFromEPSG(int(mapping['crs'].split(':')[-1]))
        transform = None
        source_crs = None
        if spatial:
            authority, code = spatial.GetAuthorityName(None), spatial.GetAuthorityCode(None)
            source_crs = f'{authority}:{code}' if authority and code else spatial.GetName()
            spatial.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            transform = osr.CoordinateTransformation(spatial,target)
        definition = layer.GetLayerDefn()
        fields = []
        for i in range(definition.GetFieldCount()):
            field = definition.GetFieldDefn(i)
            item = {'name':field.GetName()}
            if field.GetAlternativeNameRef(): item['alias'] = field.GetAlternativeNameRef()
            if field.GetDomainName():
                domain = dataset.GetFieldDomain(field.GetDomainName())
                if domain and hasattr(domain,'GetEnumeration'):
                    values = domain.GetEnumeration()
                    if values: item['codedValues'] = values; item['values'] = list(values.values())
            fields.append(item)
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
        # GeoJSON ids are identities, not row positions. GDAL may otherwise coerce strings.
        if json_driver == 'GeoJSON':
            document = json.loads(path.read_text(encoding='utf-8-sig'))
            originals = document.get('features',[]) if document.get('type')=='FeatureCollection' else [document] if document.get('type')=='Feature' else []
            if len(originals)==len(features):
                for original,feature in zip(originals,features):
                    feature['id'] = original.get('id')
        result.append({'name':name,'features':features,'fields':fields,'crs':'EPSG:4326' if spatial else None,'sourceCrs':source_crs,'geometryTypes':sorted(types),'suggestedRole':guess_role(name,types),'format':dataset.GetDriver().ShortName})
    return result
