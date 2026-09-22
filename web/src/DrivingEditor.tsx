import type {
  CampusData,
  MapEdit,
  VehicleRules,
  DrivingReview,
  ParkingConnection,
  TurnRestriction,
} from './types';

export function DrivingEditor({
  edit,
  data,
  onProperty,
}: {
  edit: MapEdit;
  data: CampusData;
  onProperty: (key: string, value: unknown) => void;
}) {
  const p = edit.properties;
  const vehicle = (p.vehicle || {
    access: 'unknown',
    direction: 'both',
  }) as VehicleRules;
  const parking = p.parking as ParkingConnection | undefined;
  const updateVehicle = (patch: Partial<VehicleRules>) =>
    onProperty('vehicle', { ...vehicle, ...patch });
  const reviewFields = (
    review: DrivingReview | undefined,
    update: (value: DrivingReview) => void,
  ) => (
    <>
      {(['audience', 'confirmedAt', 'summary'] as const).map((key) => (
        <label className="field-label" key={key}>
          {key === 'audience'
            ? 'Permitted vehicle audience'
            : key === 'confirmedAt'
              ? 'Driving approval date'
              : 'Driving approval evidence and restrictions'}
          <input
            type={key === 'confirmedAt' ? 'date' : 'text'}
            value={review?.[key] || ''}
            onChange={(e) =>
              update({
                id: `${edit.id}:driving-review`,
                audience: '',
                confirmedAt: '',
                summary: '',
                ...review,
                [key]: e.target.value,
              })
            }
          />
        </label>
      ))}
    </>
  );
  const accessOptions = (
    <>
      <option value="unknown">Unknown — excluded</option>
      <option value="reviewed">Owner reviewed driving permission</option>
      <option value="private">Private / restricted</option>
      <option value="no">No vehicle access</option>
      {vehicle.access === 'yes' && (
        <option value="yes">Public access from source</option>
      )}
    </>
  );
  const restrictions = (p.turnRestrictions || []) as TurnRestriction[];
  const junctions = data.graph.nodes.filter((n) =>
    data.graph.edges.some((e) => e.sourceId === edit.id && e.to === n.id),
  );
  return (
    <section aria-label="Driving properties">
      {(edit.kind === 'closure' || edit.kind === 'barrier') && (
        <label className="field-label">
          Closure affects
          <select
            value={String(p.closureMode || 'both')}
            onChange={(e) => onProperty('closureMode', e.target.value)}
          >
            <option value="both">Walking and driving</option>
            <option value="walking">Walking only</option>
            <option value="driving">Driving only</option>
          </select>
        </label>
      )}
      {edit.kind === 'path' && (
        <>
          <h3>Driving</h3>
          <p className="small-note">
            Walking permission does not authorize driving. Record a separate
            review for campus roads.
          </p>
          <label className="field-label">
            Vehicle access
            <select
              value={vehicle.access}
              onChange={(e) =>
                updateVehicle({
                  access: e.target.value as VehicleRules['access'],
                })
              }
            >
              {accessOptions}
            </select>
          </label>
          {vehicle.access === 'reviewed' &&
            reviewFields(vehicle.review, (review) => updateVehicle({ review }))}
          <label className="field-label">
            Vehicle direction
            <select
              value={vehicle.direction}
              onChange={(e) =>
                updateVehicle({
                  direction: e.target.value as VehicleRules['direction'],
                })
              }
            >
              <option value="both">Both directions</option>
              <option value="forward">Along the drawn line</option>
              <option value="reverse">Against the drawn line</option>
            </select>
          </label>
          <label className="field-label">
            Recorded speed (km/h)
            <input
              type="number"
              min="1"
              max="130"
              value={vehicle.speedKph ?? ''}
              onChange={(e) =>
                updateVehicle({
                  speedKph: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
          {(['parkingAisle', 'roundabout', 'conditional'] as const).map(
            (key) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  checked={!!vehicle[key]}
                  onChange={(e) => updateVehicle({ [key]: e.target.checked })}
                />
                {key === 'parkingAisle'
                  ? 'Parking aisle (10 km/h estimated)'
                  : key === 'roundabout'
                    ? 'Roundabout'
                    : 'Unresolved conditional restriction — exclude driving'}
              </label>
            ),
          )}
          <h4>Turns from this road</h4>
          {restrictions.map((restriction, index) => {
            const update = (patch: Partial<TurnRestriction>) =>
              onProperty(
                'turnRestrictions',
                restrictions.map((r, i) =>
                  i === index ? { ...r, ...patch } : r,
                ),
              );
            return (
              <fieldset key={restriction.id}>
                <legend>Turn restriction {index + 1}</legend>
                <label className="field-label">
                  Junction
                  <select
                    value={restriction.viaNodeId}
                    onChange={(e) =>
                      update({ viaNodeId: e.target.value, toSourceId: '' })
                    }
                  >
                    <option value="">Choose junction</option>
                    {junctions.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Destination road
                  <select
                    value={restriction.toSourceId}
                    onChange={(e) => update({ toSourceId: e.target.value })}
                  >
                    <option value="">Choose road</option>
                    {[
                      ...new Map(
                        data.graph.edges
                          .filter((e) => e.from === restriction.viaNodeId)
                          .map((e) => [e.sourceId, e]),
                      ).values(),
                    ].map((e) => (
                      <option key={e.sourceId} value={e.sourceId}>
                        {e.name} ({e.sourceId})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Rule
                  <select
                    value={restriction.kind}
                    onChange={(e) =>
                      update({
                        kind: e.target.value as TurnRestriction['kind'],
                      })
                    }
                  >
                    <option value="no">No turn onto this road</option>
                    <option value="only">Only turn onto this road</option>
                  </select>
                </label>
                {restriction.fromSourceId === restriction.toSourceId && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!restriction.uTurn}
                      onChange={(e) => update({ uTurn: e.target.checked })}
                    />
                    U-turn only
                  </label>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onProperty(
                      'turnRestrictions',
                      restrictions.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove turn restriction
                </button>
              </fieldset>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onProperty('turnRestrictions', [
                ...restrictions,
                {
                  id: crypto.randomUUID(),
                  fromSourceId: edit.id,
                  viaNodeId: '',
                  toSourceId: '',
                  kind: 'no',
                },
              ])
            }
          >
            Add turn restriction
          </button>
        </>
      )}
      {edit.kind === 'place' && (
        <>
          <label className="field-label">
            Vehicle transfer point
            <select
              value={parking?.kind || ''}
              onChange={(e) =>
                onProperty(
                  'parking',
                  e.target.value
                    ? {
                        id: edit.id,
                        name: String(p.name),
                        kind: e.target.value,
                        access: 'unknown',
                        vehicleNodeId: '',
                        walkingNodeId: '',
                      }
                    : null,
                )
              }
            >
              <option value="">Not a parking / drop-off point</option>
              <option value="parking">Parking</option>
              <option value="drop-off">Drop-off</option>
            </select>
          </label>
          {parking && (
            <>
              <label className="field-label">
                Parking access
                <select
                  value={parking.access}
                  onChange={(e) =>
                    onProperty('parking', {
                      ...parking,
                      access: e.target.value,
                    })
                  }
                >
                  <option value="unknown">Unknown — excluded</option>
                  <option value="reviewed">
                    Owner reviewed driving permission
                  </option>
                  <option value="private">Private / restricted</option>
                  <option value="no">Closed to vehicles</option>
                  {parking.access === 'yes' && (
                    <option value="yes">Public access from source</option>
                  )}
                </select>
              </label>
              {parking.access === 'reviewed' &&
                reviewFields(parking.review, (review) =>
                  onProperty('parking', { ...parking, review }),
                )}
              <label className="field-label">
                Shared road / walking transfer node
                <select
                  value={parking.vehicleNodeId}
                  onChange={(e) =>
                    onProperty('parking', {
                      ...parking,
                      vehicleNodeId: e.target.value,
                      walkingNodeId: e.target.value,
                    })
                  }
                >
                  <option value="">Choose mapped connection</option>
                  {data.graph.nodes
                    .filter(
                      (n) =>
                        data.graph.edges.some(
                          (e) => e.to === n.id && e.vehicleAllowed,
                        ) &&
                        data.graph.edges.some(
                          (e) => e.from === n.id && e.accessible,
                        ),
                    )
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Parking restrictions
                <input
                  value={parking.restrictions || ''}
                  onChange={(e) =>
                    onProperty('parking', {
                      ...parking,
                      restrictions: e.target.value,
                    })
                  }
                />
              </label>
              <p className="small-note">
                Map access paths first. A shared node represents the actual
                place to park and begin walking; no gap is routed automatically.
              </p>
            </>
          )}
        </>
      )}
      {edit.kind === 'barrier' && edit.geometry.type === 'Point' && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.vehiclePassable === true}
              onChange={(e) => onProperty('vehiclePassable', e.target.checked)}
            />
            Vehicle passage reviewed at this gate
          </label>
          {p.vehiclePassable === true &&
            reviewFields(
              p.vehicleReview as DrivingReview | undefined,
              (review) => onProperty('vehicleReview', review),
            )}
        </>
      )}
    </section>
  );
}
