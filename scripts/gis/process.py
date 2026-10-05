"""Deterministic, network-free GIS processing. Inputs and outputs are private job files."""
import ast
import csv
import hashlib
import io
import json
import math
import operator
import pathlib
import re
import sys
import zipfile
from collections import defaultdict

import pyproj
import shapely
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

MAX_FEATURES = 100000
MAX_BYTES = 50 * 1024 * 1024


def calculate(expression, values):
    """Interpret a small expression tree; never execute Python or access attributes."""
    if not isinstance(expression, str) or len(expression) > 2000:
        raise ValueError('Use an expression of at most 2,000 characters')
    tree = ast.parse(expression, mode='eval')
    if len(list(ast.walk(tree))) > 200:
        raise ValueError('Calculation is too complex')
    binary = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
              ast.Div: operator.truediv, ast.Mod: operator.mod}
    functions = {'abs': abs, 'round': round, 'min': min, 'max': max,
                 'coalesce': lambda *v: next((x for x in v if x is not None), None),
                 'concat': lambda *v: ''.join('' if x is None else str(x) for x in v),
                 'lower': lambda v: str(v).lower(), 'upper': lambda v: str(v).upper()}

    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float, bool, type(None))): return node.value
        if isinstance(node, ast.Name) and not node.id.startswith('_'):
            if node.id not in values: raise ValueError('Unknown field: ' + node.id)
            return values[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = visit(node.operand)
            if not isinstance(value, (int, float)): raise ValueError('Arithmetic needs numeric values')
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp) and type(node.op) in binary:
            a, b = visit(node.left), visit(node.right)
            if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                raise ValueError('Arithmetic needs numbers; use concat for text')
            return binary[type(node.op)](a, b)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in functions and not node.keywords and len(node.args) <= 20:
            return functions[node.func.id](*(visit(v) for v in node.args))
        raise ValueError('Allowed: fields, constants, arithmetic, abs, round, min, max, coalesce, concat, lower, upper')
    result = visit(tree)
    if isinstance(result, (float, int)) and (not math.isfinite(result) or abs(result) > 1e100): raise ValueError('Calculation is not a finite number')
    if isinstance(result, str) and len(result) > 10000: raise ValueError('Calculated text is too long')
    return result


def infer_schema(features, original):
    present = {k for feature in features for k in feature['properties']}
    known = {f['name']: dict(f, public=False) for f in original.get('fields', []) if f['name'] in present}
    inferred = {}
    for feature in features:
        for key, value in feature['properties'].items():
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}',key) or key in ('__proto__','constructor','prototype'): raise ValueError('Rename fields before processing: '+key+' is not a supported output field name')
            if key not in known and value is not None:
                kind = 'boolean' if isinstance(value, bool) else 'number' if isinstance(value, (float, int)) else 'text'
                if key in inferred and inferred[key] != kind: raise ValueError('Calculated values have inconsistent types: '+key)
                inferred[key] = kind
    for key in sorted(present-known.keys()):
        known[key] = {'name': key, 'type': inferred.get(key, 'text'), 'public': False}
    if len(known) > 100: raise ValueError('Result exceeds 100 fields; choose fewer join fields')
    return {'version': 1, 'fields': list(known.values())}


def run(job, output_directory):
    request, inputs = job['request'], job['inputs']
    tool, params = request['tool'], request.get('parameters', {})
    source = inputs['input']['features']
    overlay = inputs.get('overlay', {}).get('features', [])
    if len(source) > MAX_FEATURES or len(overlay) > MAX_FEATURES: raise ValueError('Input exceeds 100,000 features')
    crs = CRS.from_user_input(inputs['crs'])
    if not crs.is_projected or not crs.to_authority() or not (32601 <= int(crs.to_authority()[1]) <= 32660 or 32701 <= int(crs.to_authority()[1]) <= 32760):
        raise ValueError('Choose the campus UTM analysis CRS')
    forward = Transformer.from_crs(4326, crs, always_xy=True, allow_ballpark=False)
    inverse = Transformer.from_crs(crs, 4326, always_xy=True, allow_ballpark=False)
    metric_tools = {'buffer','clip','intersect','difference','dissolve','select-location','spatial-join','nearest','summarize-within','measure'}

    def project(feature):
        if feature.get('geometry') is None: raise ValueError('This tool needs spatial input')
        geom = shapely.force_2d(shape(feature['geometry']))
        if geom.is_empty or not geom.is_valid: raise ValueError('Repair invalid or empty geometry before analysis: '+str(feature['id']))
        west, south, east, north = geom.bounds
        area = crs.area_of_use
        if not (area.west-0.1 <= west <= east <= area.east+0.1 and area.south-0.1 <= south <= north <= area.north+0.1):
            raise ValueError('Features fall outside the analysis CRS area of use')
        result = transform(forward.transform, geom)
        if not all(math.isfinite(n) for n in result.bounds): raise ValueError('Coordinate transformation failed')
        return result

    geometries = [project(f) for f in source] if tool in metric_tools else []
    others = [project(f) for f in overlay] if tool in metric_tools and overlay else []
    if tool in {'clip','intersect','difference','select-location','spatial-join','nearest','summarize-within','attribute-join'} and 'overlay' not in inputs:
        raise ValueError('Select an overlay dataset')
    results = []

    def add(feature, geom=None, properties=None, suffix=''):
        if len(results) >= MAX_FEATURES: raise ValueError('Result exceeds 100,000 features; restrict the input')
        if geom is not None and geom.is_empty: return
        if geom is not None and geom.geom_type == 'GeometryCollection':
            for index, part in enumerate(geom.geoms): add(feature, part, properties, suffix+':part:'+str(index))
            return
        identity = hashlib.sha256((str(feature['id'])+suffix).encode()).hexdigest()[:32]
        # Derived attributes are private and never interpreted as navigation permissions.
        attrs = dict(feature.get('properties', {}) if properties is None else properties)
        results.append({'type':'Feature','id':identity,'geometry':mapping(transform(inverse.transform, geom)) if geom is not None else feature.get('geometry'),'properties':attrs})

    if tool == 'buffer':
        distance = params.get('distance')
        if isinstance(distance,bool) or not isinstance(distance,(int,float)) or not math.isfinite(distance) or not 0 < distance <= 100000:
            raise ValueError('Buffer distance must be more than 0 and at most 100,000 metres')
        for f, geom in zip(source, geometries): add(f, geom.buffer(distance, quad_segs=16))
    elif tool in {'clip','intersect','difference','select-location','spatial-join','nearest','summarize-within'}:
        tree = STRtree(others)
        fields = params.get('fields', [])
        if not isinstance(fields, list) or len(fields)>50 or any(not isinstance(k,str) for k in fields): raise ValueError('Choose at most 50 overlay fields')
        if any('join_'+k in f.get('properties',{}) for k in fields for f in source): raise ValueError('Join fields would replace existing attributes')
        for f, geom in zip(source, geometries):
            indices = sorted(int(i) for i in tree.query(geom, predicate='intersects'))
            if tool in {'clip','difference'}:
                other = unary_union([others[i] for i in indices])
                add(f, geom.intersection(other) if tool=='clip' else geom.difference(other))
            elif tool == 'intersect':
                for i in indices: add(f, geom.intersection(others[i]), dict(f['properties'], **{'join_'+k:overlay[i]['properties'].get(k) for k in fields}), ':'+str(overlay[i]['id']))
            elif tool == 'select-location':
                predicate=params.get('predicate','intersects')
                if predicate not in ('intersects','within','disjoint'): raise ValueError('Invalid location predicate')
                match = bool(indices) if predicate=='intersects' else any(geom.within(others[i]) for i in indices) if predicate=='within' else not indices
                if match: add(f)
            elif tool == 'nearest':
                distances = tree.query_nearest(geom, all_matches=True)
                i = min((int(i) for i in distances), key=lambda i:str(overlay[i]['id']), default=None)
                attrs=dict(f['properties'], nearest_id=str(overlay[i]['id']) if i is not None else None, distance_m=geom.distance(others[i]) if i is not None else None)
                add(f, properties=attrs)
            elif tool == 'spatial-join':
                # One-to-many is explicit: unmatched inputs receive null join fields.
                for i in indices or [None]: add(f, properties=dict(f['properties'], **{'join_'+k:overlay[i]['properties'].get(k) if i is not None else None for k in fields}), suffix=':'+str(overlay[i]['id']) if i is not None else ':unmatched')
            else:
                if geom.geom_type not in ('Polygon','MultiPolygon'): raise ValueError('Summarize within needs polygon input')
                inside=[i for i in indices if others[i].within(geom)]
                attrs=dict(f['properties'], within_count=len(inside))
                for key in fields:
                    vals=[overlay[i]['properties'].get(key) for i in inside]
                    nums=[v for v in vals if isinstance(v,(int,float)) and not isinstance(v,bool)]
                    attrs['sum_'+key]=sum(nums) if nums else None
                add(f, properties=attrs)
    elif tool == 'dissolve':
        field=params.get('field'); groups=defaultdict(list)
        for f, geom in zip(source, geometries): groups[json.dumps(f['properties'].get(field)) if field else 'all'].append(geom)
        for key, group in sorted(groups.items()): add({'id':key,'properties':{field:json.loads(key)} if field else {}}, unary_union(group))
    elif tool == 'measure':
        for f, geom in zip(source, geometries): add(f, properties=dict(f['properties'], area_m2=geom.area, length_m=geom.length))
    elif tool == 'attribute-join':
        left, right=params.get('inputField'),params.get('overlayField')
        fields=params.get('fields',[])
        if not isinstance(left,str) or not isinstance(right,str) or not isinstance(fields,list) or len(fields)>50: raise ValueError('Choose matching input and table fields')
        lookup={}
        for f in overlay:
            value=f['properties'].get(right)
            if value is None: continue
            key=json.dumps(value,sort_keys=True)
            if key in lookup: raise ValueError('Join table keys must be unique; aggregate duplicates first')
            lookup[key]=f['properties']
        for f in source:
            joined=lookup.get(json.dumps(f['properties'].get(left),sort_keys=True),{}) if f['properties'].get(left) is not None else {}
            if any('join_'+key in f['properties'] for key in fields): raise ValueError('Join fields would replace existing attributes')
            add(f, properties=dict(f['properties'], **{'join_'+key:joined.get(key) for key in fields}))
    elif tool == 'calculate':
        field=params.get('field','')
        import re
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}',field) or field in ('id','kind','sourceId','constructor','prototype'): raise ValueError('Choose a safe output field name')
        for f in source: add(f, properties=dict(f['properties'], **{field:calculate(params.get('expression'),f['properties'])}))
    elif tool == 'export': results=source
    else: raise ValueError('Unknown processing tool')
    original_schema=inputs['schema']
    if tool=='calculate': original_schema={'version':1,'fields':[f for f in original_schema['fields'] if f['name']!=params.get('field')]}
    schema=infer_schema(results, original_schema)
    # Joins inherit declared overlay types, including all-null columns.
    overlay_fields={f['name']:f for f in inputs.get('overlaySchema',{}).get('fields',[])}
    for field in schema['fields']:
        if field['name'].startswith('join_') and field['name'][5:] in overlay_fields:
            definition=overlay_fields[field['name'][5:]]
            field.update(type=definition['type'], required=False, public=False)
    engine={'shapely':shapely.__version__,'geos':shapely.geos_version_string,'pyproj':pyproj.__version__,'proj':pyproj.proj_version_str,'analysisCRS':crs.to_string(),'units':'metres','transformation':forward.description}
    result={'features':results,'schema':schema,'engine':engine,'message':str(len(results))+' output features. Review and apply to create a private layer.'}
    encoded=json.dumps(result,allow_nan=False,separators=(',',':')).encode()
    if len(encoded)>MAX_BYTES: raise ValueError('Output exceeds 50 MiB; restrict the input')
    output=pathlib.Path(output_directory)
    output.mkdir(parents=True,exist_ok=True)
    if tool=='export':
        export_data(results,schema,params,output,{'request':request,'engine':engine,'inputRevision':job['input_revision'],'provenance':inputs.get('provenance',{})})
        result['features']=[]
        result['message']='Export ready. Includes CRS, input revision and provenance metadata.'
    (output/'result.json').write_text(json.dumps(result,allow_nan=False),encoding='utf8')
    return result


def export_data(features, schema, params, output, metadata):
    format=params.get('format','geojson')
    if format not in ('geojson','csv','gpkg'): raise ValueError('Choose GeoJSON, CSV or GeoPackage')
    target=output/('data.'+format)
    if format=='geojson':
        if params.get('crs','EPSG:4326')!='EPSG:4326': raise ValueError('GeoJSON uses WGS84 longitude/latitude')
        target.write_text(json.dumps({'type':'FeatureCollection','features':features,'turnright':metadata},allow_nan=False),encoding='utf8')
    elif format=='csv':
        fields=[f['name'] for f in schema['fields']]
        with target.open('w',newline='',encoding='utf-8-sig') as stream:
            writer=csv.writer(stream); writer.writerow(['feature_id',*fields,'geometry_wkt'])
            def cell(v): return "'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@','\t','\r')) else v
            for f in features: writer.writerow([cell(str(f['id'])),*[cell(f['properties'].get(k)) for k in fields],shape(f['geometry']).wkt if f.get('geometry') else ''])
    else:
        from osgeo import ogr, osr, gdal
        gdal.UseExceptions()
        code=params.get('crs','EPSG:4326')
        if code!='EPSG:4326' and code!=metadata['engine']['analysisCRS']: raise ValueError('Choose WGS84 or the validated analysis CRS')
        srs=osr.SpatialReference(); srs.ImportFromEPSG(int(code.split(':')[1])); srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        dataset=ogr.GetDriverByName('GPKG').CreateDataSource(str(target))
        layer=dataset.CreateLayer('features',srs,ogr.wkbUnknown)
        identity_field='turnright_feature_id'
        while identity_field in {f['name'] for f in schema['fields']}: identity_field='_'+identity_field
        layer.CreateField(ogr.FieldDefn(identity_field,ogr.OFTString))
        metadata['identityField']=identity_field
        for field in schema['fields']:
            kind={'number':ogr.OFTReal,'boolean':ogr.OFTInteger,'date':ogr.OFTDateTime,'text':ogr.OFTString}[field['type']]
            definition=ogr.FieldDefn(field['name'],kind)
            if field['type']=='boolean': definition.SetSubType(ogr.OFSTBoolean)
            layer.CreateField(definition)
        transformer=Transformer.from_crs(4326,code,always_xy=True,allow_ballpark=False)
        layer.StartTransaction()
        for f in features:
            row=ogr.Feature(layer.GetLayerDefn())
            row.SetField(identity_field,str(f['id']))
            for field in schema['fields']:
                value=f['properties'].get(field['name'])
                if value is not None: row.SetField(field['name'],int(value) if isinstance(value,bool) else value)
            if f.get('geometry'):
                geom=transform(transformer.transform,shape(f['geometry']))
                row.SetGeometry(ogr.CreateGeometryFromJson(json.dumps(mapping(geom))))
            layer.CreateFeature(row)
        layer.CommitTransaction(); dataset.SetMetadata({'TURNRIGHT':json.dumps(metadata)}); dataset=None
    metadata['outputCRS']=params.get('crs','EPSG:4326') if format=='gpkg' else 'EPSG:4326'
    metadata['nulls']='Empty cells represent null in CSV; GeoJSON and GeoPackage preserve null values.'
    with zipfile.ZipFile(output/'export.zip','w',zipfile.ZIP_DEFLATED) as archive:
        archive.write(target,target.name); archive.writestr('metadata.json',json.dumps(metadata,indent=2))
    if (output/'export.zip').stat().st_size>MAX_BYTES: raise ValueError('Export exceeds 50 MiB')


if __name__=='__main__':
    try:
        file=pathlib.Path(sys.argv[1])
        if file.stat().st_size>MAX_BYTES*2: raise ValueError('Job input exceeds 100 MiB')
        run(json.loads(file.read_text(encoding='utf8')),sys.argv[2])
    except Exception as error:
        print(str(error),file=sys.stderr); sys.exit(1)
