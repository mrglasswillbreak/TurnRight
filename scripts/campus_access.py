"""Campus walking corrections layered over, never written into, source OSM tags."""

WALKING_HIGHWAYS = {
    'footway', 'pedestrian', 'path', 'steps', 'residential', 'service',
    'living_street', 'unclassified', 'track', 'tertiary',
}
FOOT_ALLOWED = {'yes', 'designated', 'permissive'}


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
        if campus_permission(way_id, tags, policy):
            return 'campus'
        return tags['access']
    return 'yes'


def node_blocks_walking(tags):
    # The owner's confirmation was about roads, not opening gated/restricted areas.
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
