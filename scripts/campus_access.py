"""Campus walking corrections layered over, never written into, source OSM tags."""

WALKING_HIGHWAYS = {
    'footway', 'pedestrian', 'path', 'steps', 'residential', 'service',
    'living_street', 'unclassified', 'track', 'tertiary',
}
FOOT_ALLOWED = {'yes', 'designated', 'permissive'}


def connection_review(feature_id, tags, policy):
    """Match a specific owner-reviewed connection while retaining stronger restrictions."""
    if not policy or policy.get('audience') != 'students':
        return None
    if tags.get('foot') in {'no', 'private', 'use_sidepath'} or tags.get('access') == 'no':
        return None
    if tags.get('locked') == 'yes' or 'construction' in tags or any(tags.get(key) for key in (
        'private', 'access:conditional', 'foot:conditional',
    )):
        return None
    for review in policy.get('connectionReviews', []):
        expected = review.get('expectedTags', {})
        if (review.get('featureId') == feature_id and review.get('id')
                and review.get('confirmedAt') and expected
                and all(tags.get(key) == value for key, value in expected.items())):
            return review
    return None


def access_review_id(way_id, tags, policy):
    review = connection_review(way_id, tags, policy)
    return review['id'] if review else policy['id']


def campus_permission(way_id, tags, policy):
    """Owner confirmation covers existing ordinary campus roads, not every private way."""
    return (
        policy.get('audience') == 'students'
        and way_id in policy.get('wayIds', [])
        and tags.get('highway') == 'service'
        and not tags.get('service')
        and tags.get('access') == 'private'
        and tags.get('foot') not in {'no', 'private', 'use_sidepath'}
        and not any(tags.get(key) for key in (
            'private', 'access:conditional', 'foot:conditional', 'construction',
        ))
        and tags.get('locked') != 'yes'
    )


def walking_access(way_id, tags, policy):
    """A road-specific student allowance does not override explicit foot restrictions."""
    if tags.get('construction') is not None or tags.get('locked') == 'yes':
        return 'no'
    if tags.get('foot') in {'no', 'private', 'use_sidepath'}:
        return 'private' if tags['foot'] == 'private' else 'no'
    if tags.get('highway') not in WALKING_HIGHWAYS and tags.get('foot') not in FOOT_ALLOWED:
        return 'no'
    if tags.get('access') in {'no', 'private'} and tags.get('foot') not in FOOT_ALLOWED:
        if connection_review(way_id, tags, policy) or campus_permission(way_id, tags, policy):
            return 'campus'
        return tags['access']
    return 'yes'


def node_blocks_walking(tags, node_id=None, policy=None):
    # The owner's confirmation was about roads, not opening gated/restricted areas.
    # A later, separately recorded confirmation may open one exact gate on foot.
    if tags.get('barrier') == 'gate' and connection_review(node_id, tags, policy):
        return False
    return (
        tags.get('barrier') in {'wall', 'fence', 'hedge', 'retaining_wall', 'block'}
        or tags.get('locked') == 'yes'
        or tags.get('access') in {'no', 'private'}
        or tags.get('foot') in {'no', 'private', 'use_sidepath'}
        or (
            tags.get('barrier') == 'gate'
            and tags.get('access') not in {'yes', 'permissive', 'public'}
            and tags.get('foot') not in FOOT_ALLOWED
        )
    )


VEHICLE_HIGHWAYS = {'residential', 'service', 'living_street', 'unclassified', 'tertiary', 'secondary', 'primary', 'tertiary_link', 'secondary_link', 'primary_link'}

def vehicle_rules(tags):
    access = tags.get('motorcar', tags.get('motor_vehicle', tags.get('vehicle', tags.get('access', 'yes'))))
    conditional = any(':conditional' in key for key in tags)
    if tags.get('highway') not in VEHICLE_HIGHWAYS or tags.get('construction') is not None or tags.get('locked') == 'yes':
        access = 'no'
    elif access in {'yes', 'permissive', 'designated', 'public'}:
        access = 'yes'
    elif access != 'no':
        access = 'private' if access in {'private', 'destination', 'customers', 'delivery', 'permit'} else 'unknown'
    direction = tags.get('oneway:motorcar', tags.get('oneway:motor_vehicle', tags.get('oneway', 'yes' if tags.get('junction') == 'roundabout' else 'no')))
    rules = {'access': access, 'direction': {'yes': 'forward', '1': 'forward', 'true': 'forward', '-1': 'reverse', 'no': 'both', '0': 'both', 'false': 'both'}.get(direction, 'both'), 'conditional': conditional or direction not in {'yes','1','true','-1','no','0','false'}, 'roundabout': tags.get('junction') == 'roundabout', 'parkingAisle': tags.get('service') == 'parking_aisle'}
    try:
        value = tags.get('maxspeed', '')
        speed = float(value.removesuffix(' mph')) * (1.609344 if value.endswith(' mph') else 1)
        if 0 < speed <= 130: rules['speedKph'] = speed
    except ValueError:
        pass
    return rules

def node_blocks_vehicle(tags):
    if tags.get('locked') == 'yes' or any(':conditional' in k for k in tags): return True
    access = tags.get('motorcar', tags.get('motor_vehicle', tags.get('vehicle', tags.get('access'))))
    if access and access not in {'yes', 'permissive', 'designated', 'public'}: return True
    if tags.get('barrier') in {'bollard','block','wall','fence','hedge','retaining_wall','cycle_barrier','stile','turnstile'}: return True
    return bool(tags.get('barrier') and access not in {'yes', 'permissive', 'designated', 'public'})
