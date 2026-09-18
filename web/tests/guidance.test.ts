import { describe, expect, it } from 'vitest';
import { GuidanceController, type GuidanceInput } from '../src/guidance';
import { initialNavigation, advanceNavigation } from '../src/navigation';
import { distanceClip, normalizeVoiceName } from '../src/voice-model';
import type { Route } from '../src/types';

function walk(overrides: Partial<GuidanceInput> = {}): GuidanceInput {
  const route: Route = {
    id: 'a',
    edgeIds: [],
    nodeIds: [],
    startOffset: 0,
    distance: 160,
    seconds: 128,
    coordinates: [
      [3.2, 6.46],
      [3.20145, 6.46],
    ],
    maneuvers: [
      {
        kind: 'depart',
        instruction: 'Start walking',
        at: 0,
        coordinates: [3.2, 6.46],
        street: '',
      },
      {
        kind: 'left',
        instruction: 'Turn left',
        at: 100,
        coordinates: [3.2009, 6.46],
        street: 'LAW road',
      },
      {
        kind: 'right',
        instruction: 'Turn right',
        at: 140,
        coordinates: [3.2013, 6.46],
        street: 'Campus path',
      },
      {
        kind: 'arrive',
        instruction: 'Arrive',
        at: 160,
        coordinates: [3.20145, 6.46],
        street: '',
      },
    ],
  };
  return {
    route,
    nav: { ...initialNavigation, progress: 70 },
    fix: {
      coordinates: [3.2007, 6.46],
      accuracy: 5,
      speed: 1.25,
      heading: 0,
      timestamp: 100000,
    },
    now: 100000,
    destination: 'Faculty Of Law',
    rerouting: false,
    routeFailed: false,
    ...overrides,
  };
}
describe('balanced offline guidance', () => {
  it('uses walking speed with bounded advance and immediate distances', () => {
    const slow = walk();
    slow.fix!.speed = 0.5;
    slow.nav.progress = 65;
    expect(new GuidanceController().update(slow).event).toBeUndefined();
    slow.nav.progress = 70;
    expect(new GuidanceController().update(slow).event?.clips).toEqual([
      'turn:left:30',
    ]);
    const fast = walk();
    fast.fix!.speed = 2.5;
    fast.nav.progress = 40;
    expect(new GuidanceController().update(fast).event?.clips).toEqual([
      'turn:left:60',
    ]);
    fast.nav.progress = 89;
    expect(new GuidanceController().update(fast).event?.clips).toEqual([
      'turn:left:now',
    ]);
    fast.fix!.accuracy = 25;
    expect(new GuidanceController().update(fast).event?.fallback).toEqual([
      'in-10',
      'left',
    ]);
    expect(new GuidanceController().update(fast).event?.clips).toEqual([
      'turn:left:10',
    ]);
  });
  it('uses the fallback walking pace and suppresses duplicate prompts and chatter', () => {
    const controller = new GuidanceController(),
      input = walk();
    input.fix!.speed = null;
    const event = controller.update(input).event!;
    controller.acknowledge(event, input.now);
    expect(controller.update(input).event).toBeUndefined();
    input.nav.progress = 110;
    input.nav.nextIndex = 2;
    input.now += 2000;
    input.fix!.timestamp = input.now;
    expect(controller.update(input).event).toBeUndefined();
    input.now += 7000;
    input.fix!.timestamp = input.now;
    expect(controller.update(input).event?.clips).toEqual(['turn:right:30']);
    input.nav.progress = 95;
    input.nav.nextIndex = 1;
    expect(controller.update(input).event?.priority).toBe(1);
  });
  it('combines close turns and suppresses the second advance cue, retaining its immediate cue', () => {
    const controller = new GuidanceController(),
      input = walk();
    input.route.maneuvers[2].at = 120;
    const event = controller.update(input).event!;
    expect(event.clips).toEqual(['chain:left:right:soon']);
    controller.acknowledge(event, input.now);
    input.now += 10000;
    input.fix!.timestamp = input.now;
    input.nav.progress = 107;
    input.nav.nextIndex = 2;
    expect(controller.update(input).event).toBeUndefined();
    input.nav.progress = 114;
    expect(controller.update(input).event?.clips).toEqual(['turn:right:now']);
  });
  it('does not announce arrival before confirmation and preserves the unverified approach warning', () => {
    const controller = new GuidanceController(),
      input = walk();
    input.nav.nextIndex = 3;
    input.nav.progress = 153;
    expect(controller.update(input).event?.clips).toEqual([
      'destination-ahead',
    ]);
    input.nav.arrived = true;
    expect(controller.update(input).event?.clips).toEqual(['arrive-approach']);
    input.arrivalKind = 'entrance';
    expect(controller.update(input, true).event?.clips).toEqual([
      'arrive-entrance',
    ]);
    input.fix = null;
    expect(controller.update(input, true).event?.clips).toEqual([
      'arrive-entrance',
    ]);
  });
  it('handles repeated weak/stale episodes and requires two distinct good fixes to recover', () => {
    const controller = new GuidanceController(),
      input = walk();
    input.fix!.accuracy = 50;
    const warning = controller.update(input).event!;
    controller.acknowledge(warning, input.now);
    expect(controller.update(input).event).toBeUndefined();
    input.fix!.accuracy = 5;
    expect(controller.update(input).event).toBeUndefined();
    expect(controller.update(input, true).event?.clips).toEqual(['weak']);
    expect(controller.update(input).event).toBeUndefined();
    input.fix!.timestamp += 1000;
    input.now += 1000;
    const recovery = controller.update(input).event!;
    expect(recovery.clips).toEqual(['recovered']);
    controller.acknowledge(recovery, input.now);
    input.route.id = 'replacement';
    expect(controller.update(input).event?.clips).toEqual(['rerouted']);
    input.now += 13000;
    expect(controller.update(input).event?.clips).toEqual(['stale']);
    expect(controller.update(input, true).event?.clips).toEqual(['stale']);
  });
  it('cancels old instructions while off route, rerouting or failing, then announces the new route', () => {
    const controller = new GuidanceController(),
      input = walk();
    controller.update(input);
    input.nav.offRouteSince = input.now;
    expect(controller.update(input)).toEqual({ cancel: true });
    expect(controller.update(input, true).event?.clips).toEqual(['off-route']);
    input.rerouting = true;
    expect(controller.update(input).event?.clips).toEqual(['rerouting']);
    input.rerouting = false;
    input.routeFailed = true;
    expect(controller.update(input, true).event?.clips).toEqual([
      'route-unavailable',
    ]);
    input.routeFailed = false;
    input.nav.offRouteSince = null;
    input.route.id = 'b';
    const update = controller.update(input);
    expect(update.cancel).toBe(true);
    expect(update.event?.clips).toEqual(['rerouted']);
  });
  it('resets guidance when recalculation returns the same edge-based route ID', () => {
    const controller = new GuidanceController(),
      input = walk();
    controller.acknowledge(controller.update(input).event!, input.now);
    input.route = structuredClone(input.route);
    const replacement = controller.update(input);
    expect(replacement.cancel).toBe(true);
    expect(replacement.event?.clips).toEqual(['rerouted']);
  });
  it('handles skipped fixes and backtracking without replaying completed turn prompts', () => {
    const controller = new GuidanceController(),
      input = walk();
    input.nav.progress = 98;
    const event = controller.update(input).event!;
    controller.acknowledge(event, input.now);
    input.nav.progress = 70;
    expect(controller.update(input).event).toBeUndefined();
    expect(controller.update(input, true).event?.clips).toEqual([
      'turn:left:30',
    ]);
    input.nav.progress = 106;
    expect(controller.update(input).event).toBeUndefined();
  });
  it('never rounds a long remaining distance down to a misleading short clip', () => {
    expect(distanceClip(900)).toBeUndefined();
    expect(distanceClip(95)).toBe(100);
    const input = walk();
    input.route.maneuvers[1].at = 1000;
    expect(new GuidanceController().update(input, true).event?.clips).toEqual([
      'continue',
    ]);
    expect(normalizeVoiceName('  LAW  Road ')).toBe('law road');
  });
  it('keeps a turn eligible until five metres beyond it', () => {
    const input = walk();
    const fix = {
      ...input.fix!,
      coordinates: [3.20089, 6.46] as [number, number],
    };
    const next = advanceNavigation(
      input.route,
      fix,
      initialNavigation,
      input.now,
    );
    expect(next.progress).toBeGreaterThan(95);
    expect(next.progress).toBeLessThan(105);
    expect(next.nextIndex).toBe(1);
    input.route.distance = 105;
    input.route.maneuvers = [
      input.route.maneuvers[0],
      input.route.maneuvers[1],
      { ...input.route.maneuvers[3], at: 105 },
    ];
    expect(
      advanceNavigation(input.route, fix, initialNavigation, input.now)
        .nextIndex,
    ).toBe(1);
  });
});
