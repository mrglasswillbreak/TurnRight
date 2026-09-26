"""Complete queryable ArcGIS layers, including embedded Web Map collections."""
import json
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from .network import public_json


def endpoint(url, operation=None):
    parts = urlsplit(url)
    path = parts.path.rstrip('/') + ('/' + operation if operation else '')
    return urlunsplit((parts.scheme, parts.netloc, path, '', ''))


def layer_features(url, bounds, get=public_json):
    meta = get(endpoint(url) + '?f=json')
    if 'Query' not in meta.get('capabilities', ''):
        raise ValueError(f"{meta.get('name', url)} does not support feature queries.")
    params = {'f':'json','where':'1=1','geometry':json.dumps({'xmin':bounds[0][0],'ymin':bounds[0][1],'xmax':bounds[1][0],'ymax':bounds[1][1],'spatialReference':{'wkid':4326}}), 'geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects'}
    query = endpoint(url, 'query')
    expected = get(query, {**params,'returnCountOnly':'true'}).get('count')
    if not isinstance(expected, int) or expected < 0 or expected > 100000:
        raise ValueError('ArcGIS layer is too large or did not report a complete feature count.')
    ids_result = get(query, {**params,'returnIdsOnly':'true'})
    ids = ids_result.get('objectIds') or []
    if ids_result.get('exceededTransferLimit') or len(ids) != expected or len(set(ids)) != expected:
        raise ValueError('ArcGIS returned an incomplete object list. Nothing was imported.')
    field = meta.get('objectIdField') or meta.get('objectIdFieldName') or ids_result.get('objectIdFieldName')
    if not field:
        raise ValueError('ArcGIS did not provide a stable object identifier.')
    size = min(500, max(1, int(meta.get('maxRecordCount', 500))))
    records = []
    for start in range(0, len(ids), size):
        batch = ids[start:start+size]
        page = get(query, {'f':'json','objectIds':','.join(map(str,batch)),'outFields':'*','returnGeometry':'true','outSR':4326})
        features = page.get('features', [])
        received = [f.get('attributes', {}).get(field) for f in features]
        if page.get('exceededTransferLimit') or len(received) != len(batch) or set(received) != set(batch):
            raise ValueError('ArcGIS feature download was incomplete or changed during import. Retry the preview.')
        records.extend(features)
    if get(query, {**params,'returnCountOnly':'true'}).get('count') != expected:
        raise ValueError('ArcGIS changed during import. Retry to obtain a complete snapshot.')
    return {'name':str(meta.get('name', 'Layer')), 'features':records, 'fields':meta.get('fields',[]), 'geometryType':meta.get('geometryType'), 'spatialReference':{'wkid':4326}, 'objectIdFieldName':field, 'sourceUrl':url}


def discover(url, bounds, get=public_json, _visited=None):
    visited = set() if _visited is None else _visited
    identity = endpoint(url) + '?' + urlsplit(url).query
    if identity in visited or len(visited) >= 100:
        raise ValueError('ArcGIS references contain a cycle or exceed 100 layers. Choose a smaller service.')
    visited.add(identity)
    parts = urlsplit(url)
    item = parse_qs(parts.query).get('id', [None])[0]
    if not item and '/sharing/rest/content/items/' in parts.path and not parts.path.rstrip('/').endswith('/data'):
        item = parts.path.rstrip('/').split('/')[-1]
    if item:
        if len(item) != 32 or any(c not in '0123456789abcdef' for c in item.lower()):
            raise ValueError('Invalid ArcGIS item identifier.')
        root = urlunsplit((parts.scheme, parts.netloc, '/sharing/rest/content/items/' + item, '', ''))
        metadata = get(root + '?f=json')
        if metadata.get('type') == 'Web Map':
            value = get(root + '/data?f=json')
        elif metadata.get('url'):
            return discover(metadata['url'], bounds, get, visited)
        else:
            raise ValueError('This ArcGIS item does not contain a supported vector map.')
    else:
        value = get(endpoint(url) + '?f=json')
    layers, warnings = [], []
    def visit(entry):
        if entry.get('layers') and not entry.get('url'):
            for child in entry['layers']: visit(child)
        elif entry.get('featureCollection'):
            for index, layer in enumerate(entry['featureCollection'].get('layers', [])):
                feature_set = layer.get('featureSet', {})
                definition = layer.get('layerDefinition', {})
                layers.append({**definition, **feature_set, 'name':entry.get('title', definition.get('name', f'Layer {index+1}')), 'fields':definition.get('fields', feature_set.get('fields', []))})
        elif entry.get('url'):
            if any(s in entry.get('layerType','').lower() for s in ('tile','imagery','image')):
                warnings.append(f"Skipped non-vector layer: {entry.get('title',entry['url'])}")
                return
            child_layers, notes = discover(entry['url'], bounds, get, visited)
            layers.extend(child_layers); warnings.extend(notes)
        else:
            warnings.append('Skipped unsupported Web Map layer: ' + str(entry.get('title','unnamed')))
    if 'operationalLayers' in value:
        for layer in value['operationalLayers']: visit(layer)
    elif 'layers' in value and 'geometryType' not in value:
        for layer in value['layers']:
            if layer.get('subLayerIds'):
                continue
            if len(layers) >= 100:
                raise ValueError('Choose a service with at most 100 layers.')
            child = endpoint(url) + '/' + str(layer['id'])
            meta = get(child + '?f=json')
            if 'Query' not in meta.get('capabilities',''):
                warnings.append('Skipped non-queryable layer: '+str(layer.get('name',child)))
            else:
                layers.append(layer_features(child,bounds,get))
    elif 'geometryType' in value:
        layers.append(layer_features(url,bounds,get))
    else:
        raise ValueError('Use a public Web Map, FeatureServer or queryable MapServer layer URL.')
    if len(layers) > 100 or sum(len(layer.get('features', [])) for layer in layers) > 100000:
        raise ValueError('ArcGIS source exceeds the layer or feature limit.')
    return layers, warnings
