# Offline campus driving

TurnRight supports passenger-car navigation within the downloaded campus network. Walking remains the first-use default; the selected travel mode is remembered on the device. There is no live traffic, parking occupancy, external routing service, or background navigation.

Each journey uses one selected campus’s reviewed network. Switching campuses ends the active route explicitly; there is no cross-campus routing. A published map without a reviewed network shows directions unavailable. Generic imported lines and GPX tracks do not acquire vehicle or walking access automatically.

## Journey behavior

Directions can combine a driving leg and a walking leg. The app ranks complete journeys by estimated total time and offers up to two sufficiently different alternatives. Users can choose a mapped parking or drop-off point. Rerouting during the driving leg retains that choice; unavailable connections produce an explanation rather than a substitute parking destination.

Purple routes are driving; blue routes are walking. Driving uses recorded road speeds where present and estimated speeds of 20 km/h on ordinary campus roads or 10 km/h in parking aisles otherwise. Estimates exclude congestion and the time needed to find parking. A displayed speed is an ETA input, not an instruction or confirmed legal speed limit.

Arrival requires three distinct accurate GPS fixes near the vehicle endpoint. Known speed must be below 2 m/s. Navigation waits for **Parked—start walking** before switching legs. Walking then uses the existing walking routing and arrival behavior. GPS loss pauses progression and voice guidance. Driving deviations require five seconds off-route; recalculation retains the existing 15-second cooldown.

Driving advance voice cues use recent speed, bounded to 50–200 m; immediate cues use 12–35 m and require GPS accuracy of 15 m or better. Roundabout speech asks the user to follow the highlighted exit; the screen identifies the mapped exit. Generic names remain visible even when no named recording exists. Mute, Repeat, Stop and foreground/background behavior apply to both legs.

## Owner workflow

1. Select a road in the editor. Under **Driving**, set vehicle access, direction and any recorded speed. Mark parking aisles, roundabouts and unresolved conditional restrictions as appropriate.
2. For campus/private roads, choose **Owner reviewed driving permission** and record the audience, approval date, and evidence/restrictions. Existing walking approvals never count as driving approvals. Do not clear an unresolved restriction without checking its source and current access conditions.
3. Add turn restrictions from the selected road using a mapped junction and destination road. Select a U-turn-only restriction when the incoming and outgoing road are the same and only reversing is prohibited.
4. Map parking access paths and the walking connection. Create or select a place, mark it as parking or drop-off, and choose its actual shared road/walking transfer node. A parking polygon or nearby building alone does not establish this connection. Record parking access evidence and restrictions separately.
5. A point barrier at a mapped gate can record vehicle passage approval. Bollards and other physical obstructions do not become passable through a gate approval. Closures can affect walking, driving, or both.
6. Check validation, route comparisons, and release impact. Missing connections, incomplete approvals and broken turn restrictions block publication. The normal reviewed preview/publish/rollback workflow remains authoritative.

A permission's audience and restrictions describe who may use it; TurnRight has no public identity or permit verification. Owners must leave time-dependent or otherwise unresolved restrictions excluded. The absence of a driving journey is expected until the required campus roads, gates and parking have separate approval.

## Data and compatibility

Driving campus data and package manifests use schema version 2. Older applications reject these manifests instead of silently applying walking assumptions. The updated app accepts schema 1 as walking-only and asks for an updated campus map when driving is selected.

`GraphEdge.vehicle` stores access, direction, speed and review metadata; `vehicleAllowed` stores the directed segment's eligibility after topology and barrier handling. `CampusData.driving` contains parking connections and turn restrictions. Route requests carry travel mode and optional parking ID. Driving results include ordered driving/walking legs, per-segment driving durations, total estimates and parking identity.

The importer retains motor-vehicle roads independently of walking eligibility. Passenger-car access takes precedence over general motor-vehicle, vehicle, and access tags. Steps and unmapped vehicle permissions are excluded. One-way tags and roundabouts affect cars independently of foot direction. Conditional and unsupported via-way turn restrictions fail closed pending review.

`scripts/upgrade_driving.py` adds source-derived vehicle data to an existing walking seed without replacing its walking permissions or inventing parking approvals. Run it once against a walking-only seed; later updates use source reconciliation. New source imports include driving metadata directly.

Voice recordings are immutable, checked by hash, and precached with the app. Campus packages contain routing metadata; voice assets remain in the app cache under the established voice delivery model. Save both the app and campus package before going offline.

## Verification

Unit tests cover mixed journeys, independent access, direction, closures, barriers, turns, parking gaps, selected parking retention, editor reconstruction, ETA and stopped arrival. Python tests cover source access, one-way/roundabout tags, conditional restrictions and gate behavior. Browser tests exercise the complete driving-to-walking handoff at desktop and mobile widths and verify older-package behavior.

Automated GPS traces establish application behavior, not field accuracy. The bundled campus routes and parking access are not field-verified. Production driving access remains subject to the owner's separate review and publication.
