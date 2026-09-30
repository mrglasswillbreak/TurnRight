"""Bounded geometry preparation with receipts; original files are never rewritten."""
import copy
import math


def components(geometry, path=''):
    if geometry and geometry.get('type') == 'GeometryCollection':
        for index, child in enumerate(geometry.get('geometries', [])):
            yield from components(child, path + ':' + str(index))
    else:
        yield path, geometry


def prepare_geometry(value):
    from shapely.geometry import shape, mapping
    from shapely.geometry.polygon import orient
    from shapely import make_valid
    from shapely.ops import transform
    from shapely.validation import explain_validity
    from pyproj import CRS, Transformer
    original = copy.deepcopy(value)
    value = copy.deepcopy(value)
    fixes = []
    def clean(points, ring=False):
        out = []
        for point in points:
            if len(point) < 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in point[:2]):
                raise ValueError('Coordinates must contain finite longitude and latitude values.')
            point = point[:2]
            if not out or point != out[-1]: out.append(point)
            else: fixes.append('Removed consecutive duplicate vertex')
        if ring and out and out[-1] != out[0]:
            if len(out) < 3: raise ValueError('Polygon ring has fewer than three vertices.')
            out.append(out[0]); fixes.append('Closed polygon ring')
        return out
    kind = value.get('type')
    if kind == 'Polygon': value['coordinates'] = [clean(r, True) for r in value['coordinates']]
    elif kind == 'MultiPolygon': value['coordinates'] = [[clean(r, True) for r in p] for p in value['coordinates']]
    elif kind == 'LineString': value['coordinates'] = clean(value['coordinates'])
    elif kind == 'MultiLineString': value['coordinates'] = [clean(r) for r in value['coordinates']]
    geom = shape(value)
    if geom.is_empty: raise ValueError('Empty geometry')
    receipt = None
    if not geom.is_valid:
        reason = explain_validity(geom)
        if kind not in ('Polygon', 'MultiPolygon'): raise ValueError(reason)
        repaired = make_valid(geom)
        if not repaired.is_valid or repaired.is_empty or repaired.geom_type not in ('Polygon', 'MultiPolygon'):
            raise ValueError(reason + ': repair needs review because components would be discarded or change dimension.')
        centre = geom.centroid
        projection = CRS.from_proj4(f'+proj=laea +lat_0={centre.y} +lon_0={centre.x} +datum=WGS84 +units=m')
        operation = Transformer.from_crs('EPSG:4326', projection, always_xy=True).transform
        before, after = transform(operation, geom).area, transform(operation, repaired).area
        change = abs(after-before) / max(before, 1e-12)
        original_parts = len(geom.geoms) if geom.geom_type=='MultiPolygon' else 1
        repaired_parts = len(repaired.geoms) if repaired.geom_type=='MultiPolygon' else 1
        if repaired_parts < original_parts: raise ValueError(reason + ': repair merges polygon components; review required.')
        if not math.isfinite(change) or change > .01: raise ValueError(reason + ': repair changes area by more than 1%; review the source geometry.')
        receipt = {'reason': reason, 'beforeType': kind, 'afterType': repaired.geom_type, 'areaChangePercent': change*100, 'beforeAreaM2':before, 'afterAreaM2':after, 'beforeValid':False, 'afterValid':True, 'discardedComponents':0}
        geom = repaired
        fixes.append('Repaired polygon self-intersection')
    polygons = list(geom.geoms) if geom.geom_type=='MultiPolygon' else [geom] if geom.geom_type=='Polygon' else []
    if any(not p.exterior.is_ccw or any(r.is_ccw for r in p.interiors) for p in polygons): fixes.append('Normalized polygon winding')
    if geom.geom_type == 'Polygon': geom = orient(geom, sign=1)
    elif geom.geom_type == 'MultiPolygon':
        from shapely.geometry import MultiPolygon
        geom = MultiPolygon([orient(p, sign=1) for p in geom.geoms])
    import hashlib, json
    trace = hashlib.sha256(json.dumps(original,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return geom, ({'originalGeometrySha256':trace, **(receipt or {}), 'actions': sorted(set(fixes))} if fixes else None)


def preview_features(layers, limit=2000):
    """Fair per-layer quotas, evenly spread across each complete feature set."""
    from .semantics import mapped_properties
    result, quotas = [], [0]*len(layers)
    eligible = [[f for f in l['features'] if f.get('geometry') and l.get('crs')=='EPSG:4326'] for l in layers]
    while sum(quotas) < limit:
        progressed = False
        for index, layer in enumerate(layers):
            if quotas[index] < len(eligible[index]):
                quotas[index] += 1
                progressed = True
            if sum(quotas) == limit: break
        if not progressed: break
    for index, layer in enumerate(layers):
        features, count = eligible[index], quotas[index]
        for sample in range(count):
                position = round(sample*(len(features)-1)/(count-1)) if count>1 else len(features)//2
                f = features[position]
                role = layer.get('suggestedRole', 'overlay')
                props = {**(f.get('properties') or {}), 'importLayer': layer['name']}
                if not props.get('kind'):
                    props['kind'] = 'land' if role in ('landcover','road-surface') else 'overlay' if role in ('skip','boundary') else role
                if role in ('landcover', 'road-surface'):
                    props.update(mapped_properties(props, {}, role))
                result.append({**f, 'properties':props})
    return {'type':'FeatureCollection','features':result}, [{'layer':l['name'],'shown':quotas[i],'total':len(l['features'])} for i,l in enumerate(layers)]
