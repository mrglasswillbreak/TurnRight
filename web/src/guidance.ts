import type { NavigationState } from './navigation';
import type { GpsFix, Route } from './types';
import { distanceClip, turnKinds, type GuidanceEvent } from './voice-model';

export interface GuidanceInput {
  route: Route;
  nav: NavigationState;
  fix: GpsFix | null | undefined;
  destination: string;
  arrivalKind?: 'entrance' | 'mapped-approach' | 'unmapped';
  rerouting: boolean;
  routeFailed: boolean;
  now: number;
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** Decisions are independent of React, audio hardware and network timing. */
export class GuidanceController {
  private routeId = '';
  private route: Route | undefined;
  private mode = '';
  private announced = new Set<string>();
  private lastRoutine = -Infinity;
  private speeds: number[] = [];
  private speedTimestamp = -1;
  private weakEpisode = 0;
  private recovering = false;
  private goodFixes = 0;
  private goodTimestamp = -1;
  private updatedRoute = false;
  private repeatId = 0;

  acknowledge(event: GuidanceEvent, now: number) {
    this.announced.add(event.id);
    for (const key of event.suppresses || []) this.announced.add(key);
    if (event.priority === 0) this.lastRoutine = now;
  }

  update(
    input: GuidanceInput,
    repeat = false,
  ): { event?: GuidanceEvent; cancel: boolean } {
    const { route, nav, fix, now } = input;
    // Routing IDs describe the edge sequence. A recalculation can return the
    // same ID, so a new route object also starts a fresh announcement session.
    const changed = this.route !== route || this.routeId !== route.id;
    if (changed) {
      this.updatedRoute = !!this.routeId && this.route?.mode === route.mode;
      if (this.route?.mode !== route.mode) {
        this.speeds = [];
        this.speedTimestamp = -1;
      }
      this.routeId = route.id;
      this.route = route;
      // GPS episodes span route replacements; do not announce the same
      // loss/recovery again merely because rerouting produced a new ID.
      this.announced = new Set(
        [...this.announced].filter((key) => key.startsWith('gps:')),
      );
      this.lastRoutine = -Infinity;
    }
    const quality =
      !fix || now - fix.timestamp > 12000
        ? 'stale'
        : fix.accuracy <= 0 || fix.accuracy > 35
          ? 'weak'
          : nav.quality;
    const mode = nav.arrived
      ? 'arrived'
      : quality !== 'good'
        ? quality
        : input.rerouting
          ? 'rerouting'
          : input.routeFailed
            ? 'route-unavailable'
            : nav.offRouteSince !== null
              ? 'off-route'
              : 'walking';
    const cancel = changed || mode !== this.mode;
    this.mode = mode;
    const make = (
      key: string,
      clips: string[],
      priority: 0 | 1 | 2,
      fallback: string[],
      extra: Partial<GuidanceEvent> = {},
    ): GuidanceEvent => ({
      id: `${route.id}:${key}`,
      routeId: route.id,
      clips,
      priority,
      fallback,
      ...extra,
    });
    const decision = (event?: GuidanceEvent) => {
      if (event && repeat)
        return {
          cancel,
          event: {
            ...event,
            id: `repeat:${++this.repeatId}`,
            priority: Math.max(1, event.priority) as 1 | 2,
            suppresses: [event.id, ...(event.suppresses || [])],
          },
        };
      if (
        event &&
        (this.announced.has(event.id) ||
          (event.priority === 0 && now - this.lastRoutine < 8000))
      )
        return { cancel };
      return { cancel, event };
    };
    if (nav.arrived)
      return decision(
        make(
          'arrived',
          [
            route.mode === 'driving'
              ? 'arrive-parking'
              : input.arrivalKind === 'entrance'
                ? 'arrive-entrance'
                : 'arrive-approach',
          ],
          2,
          route.mode === 'driving'
            ? ['arrive']
            : input.arrivalKind === 'entrance'
              ? ['arrive']
              : ['arrive', 'approach'],
          { destination: input.destination },
        ),
      );
    if (quality !== 'good') {
      if (!this.recovering) {
        this.weakEpisode++;
        this.recovering = true;
      }
      this.goodFixes = 0;
      this.goodTimestamp = -1;
      return decision(
        make(`weak:${this.weakEpisode}`, [quality], 2, ['weak'], {
          id: `gps:weak:${this.weakEpisode}`,
        }),
      );
    }
    if (this.recovering) {
      if (fix!.timestamp !== this.goodTimestamp) {
        this.goodFixes++;
        this.goodTimestamp = fix!.timestamp;
      }
      if (this.goodFixes < 2)
        return repeat
          ? {
              ...decision(
                make(`weak:${this.weakEpisode}`, ['weak'], 2, ['weak'], {
                  id: `gps:weak:${this.weakEpisode}`,
                }),
              ),
              cancel: true,
            }
          : { cancel: true };
      this.recovering = false;
    }
    if (mode === 'rerouting')
      return decision(
        make(`rerouting:${nav.offRouteSince}`, ['rerouting'], 2, ['reroute']),
      );
    if (mode === 'route-unavailable')
      return decision(
        make(`failed:${nav.offRouteSince}`, ['route-unavailable'], 2, [
          'reroute',
        ]),
      );
    if (mode === 'off-route')
      return repeat
        ? decision(make('off-route', ['off-route'], 2, ['reroute']))
        : { cancel };
    const recoveryKey = `gps:recovered:${this.weakEpisode}`;
    if (!repeat && this.weakEpisode && !this.announced.has(recoveryKey))
      return decision(
        make(recoveryKey, ['recovered'], 2, ['ready'], { id: recoveryKey }),
      );
    if (
      !repeat &&
      this.updatedRoute &&
      !this.announced.has(`${route.id}:updated`)
    )
      return decision(make('updated', ['rerouted'], 2, ['reroute']));
    if (fix!.timestamp !== this.speedTimestamp) {
      this.speedTimestamp = fix!.timestamp;
      if (
        fix!.speed !== null &&
        Number.isFinite(fix!.speed) &&
        fix!.speed >= 0.3 &&
        fix!.speed <= (route.mode === 'driving' ? 36 : 3)
      )
        this.speeds = [...this.speeds.slice(-4), fix!.speed];
      else this.speeds = [];
    }
    const ordered = [...this.speeds].sort((a, b) => a - b);
    const speed = ordered.length
      ? ordered[Math.floor(ordered.length / 2)]
      : route.mode === 'driving'
        ? route.distance / Math.max(1, route.seconds)
        : 1.25;
    const advance =
        route.mode === 'driving'
          ? clamp(speed * 20, 50, 200)
          : clamp(speed * 30, 30, 60),
      immediate =
        route.mode === 'driving'
          ? clamp(speed * 4, 12, 35)
          : clamp(speed * 6, 8, 12);
    const index = nav.nextIndex,
      next = route.maneuvers[index];
    const remaining = next ? next.at - nav.progress : Infinity;
    const imminent =
      next &&
      turnKinds.includes(next.kind) &&
      remaining <= immediate &&
      remaining >= -5 &&
      fix!.accuracy <= 15;
    if (
      !repeat &&
      nav.progress <= 5 &&
      !this.updatedRoute &&
      !imminent &&
      !this.announced.has(`${route.id}:depart`)
    )
      return decision(
        make(
          'depart',
          [route.mode === 'driving' ? 'depart-driving' : 'depart'],
          0,
          route.mode === 'driving' ? ['straight'] : ['depart'],
          {
            destination: input.destination,
            expiresAtProgress: Math.min(10, next?.at || 10),
          },
        ),
      );
    if (next?.roundaboutExit !== undefined && remaining <= advance)
      return decision(
        make(`${index}:roundabout`, ['roundabout'], 1, ['straight']),
      );
    if (!next || next.kind === 'arrive') {
      // Arrival is a confirmed state, never a turn that can be spoken early.
      if (repeat || remaining <= advance)
        return decision(
          make('destination-ahead', ['destination-ahead'], 0, ['straight']),
        );
      return { cancel };
    }
    if (remaining < -5 || (!repeat && remaining > advance)) return { cancel };
    if (repeat && remaining > 220)
      return decision(make('continue', ['continue'], 0, ['straight']));
    if (!imminent && remaining < 0)
      return repeat
        ? decision(make('continue', ['continue'], 0, ['straight']))
        : { cancel };
    const phase = imminent ? 'now' : 'soon';
    if (!repeat && this.announced.has(`${route.id}:${index}:now`))
      return { cancel };
    const second = route.maneuvers[index + 1];
    const chain =
      turnKinds.includes(next.kind) &&
      second &&
      turnKinds.includes(second.kind) &&
      second.at - next.at <= 25;
    const metres = distanceClip(remaining);
    const clips =
      chain && (imminent || remaining <= advance)
        ? [`chain:${next.kind}:${second.kind}:${phase}`]
        : imminent
          ? [`turn:${next.kind}:now`]
          : metres
            ? [`turn:${next.kind}:${metres}`]
            : ['continue'];
    const legacyDistance =
      metres &&
      [10, 20, 30, 50, 100, 200].reduce((a, b) =>
        Math.abs(a - metres) <= Math.abs(b - metres) ? a : b,
      );
    return decision(
      make(
        `${index}:${phase}`,
        clips,
        imminent ? 1 : 0,
        [
          ...(!imminent && legacyDistance ? [`in-${legacyDistance}`] : []),
          next.kind,
          ...(chain ? ['then', second.kind] : []),
        ],
        {
          road: chain ? undefined : next.street,
          expiresAtProgress: next.at + 5,
          suppresses: chain ? [`${route.id}:${index + 1}:soon`] : [],
        },
      ),
    );
  }
}
