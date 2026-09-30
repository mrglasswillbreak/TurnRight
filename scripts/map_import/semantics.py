"""Conservative, source-independent presentation classification. Never grants access."""
import re


def key(value):
    return re.sub(r'[^a-z0-9]', '', str(value or '').lower())


def surface_class(value):
    text = key(value)
    if any(x in text for x in ('sidewalk', 'footway', 'pedestrian', 'pavement')): return 'sidewalk'
    if any(x in text for x in ('carpark', 'parking')): return 'parking'
    if any(x in text for x in ('road', 'drive', 'street')): return 'road'
    return None


def land_class(value):
    text = key(value)
    if surface_class(text): return surface_class(text)
    if any(x in text for x in ('wetland', 'marsh', 'swamp')): return 'wetland'
    if any(x in text for x in ('water', 'lagoon', 'lake', 'river', 'pond')): return 'water'
    if any(x in text for x in ('treeline', 'hedge', 'shrub', 'green', 'vegetation', 'forest', 'grass', 'garden', 'wood')): return 'green'
    if any(x in text for x in ('sport', 'pitch', 'court', 'stadium')): return 'sports'
    if any(x in text for x in ('bare', 'sand')): return 'bare'
    return 'developed'


def surface(value):
    text = key(value)
    if any(x in text for x in ('unpaved', 'untarred', 'gravel', 'dirt', 'earth', 'sand')): return 'unpaved'
    if any(x in text for x in ('paved', 'tarred', 'asphalt', 'concrete', 'sidewalk')): return 'paved'
    return ''


def mapped_properties(attrs, mapping, role):
    """Only explicitly understood fields enter a public package."""
    lookup = {key(k): v for k, v in attrs.items()}
    def value(field, *aliases):
        if mapping.get(field): return attrs.get(mapping[field])
        return next((lookup[key(alias)] for alias in aliases if lookup.get(key(alias)) not in (None, '')), None)
    result = {}
    for field, target, aliases in [
        ('roadClassField', 'highway', ('highway', 'road_class', 'roadtype')),
        ('surfaceField', 'surface', ('surface', 'surface_type')),
        ('landUseField', 'landUse', ('landuse', 'land_use', 'natural', 'class', 'type', 'NAME')),
        ('vegetationField', 'vegetation', ('vegetation', 'vegetation_type')),
    ]:
        v = value(field, *aliases)
        if v is not None: result[target] = str(v).strip()[:200]
    if mapping.get('roadClass'): result['highway'] = mapping['roadClass']
    if mapping.get('landClass'): result['landClass'] = mapping['landClass']
    if role in ('landcover', 'road-surface'):
        name = str(value('nameField', 'name') or '')
        result.setdefault('landClass', land_class(result.get('landUse') or name))
        if role == 'road-surface':
            result['landClass'] = surface_class(result.get('landUse') or name) or 'road'
        result.setdefault('surface', surface(result.get('landUse') or name))
        if not result.get('vegetation'):
            text = key(name)
            for part, kind in [('tree', 'trees'), ('hedge', 'hedges'), ('shrub', 'shrubs')]:
                if part in text: result['vegetation'] = kind; break
    width = value('widthField', 'width', 'road_width')
    if width not in (None, ''):
        import math
        try:
            metres = float(str(width).strip().removesuffix(' m')) * (0.3048 if mapping.get('widthUnit') == 'ft' else 1)
            if not math.isfinite(metres) or not 0 < metres <= 200: raise ValueError()
            result['width'] = metres
        except (TypeError, ValueError): raise ValueError('Invalid mapped width; enter metres or feet between 0 and 200 m.')
    if role == 'overlay':
        result.update({k: mapping[k] for k in ('color', 'opacity', 'visible', 'order', 'labelField') if k in mapping})
        if mapping.get('labelField'): result['label'] = str(attrs.get(mapping['labelField']) or '')[:200]
    return result


def public_tags(attrs):
    """Routing and presentation tags only; the private original retains all attributes."""
    allowed = {'highway','name','service','surface','width','smoothness','incline','lit','covered','tunnel','bridge','layer','level','barrier','entrance','access','foot','wheelchair','vehicle','motor_vehicle','motorcar','bicycle','oneway','oneway:foot','oneway:bicycle','junction','maxspeed','lanes','steps','step_count','kerb','crossing','construction','access:conditional','foot:conditional','motor_vehicle:conditional','opening_hours','restriction','type','area'}
    return {key:value for key,value in attrs.items() if key in allowed}
