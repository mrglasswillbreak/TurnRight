import type { ManeuverKind } from './types';

export const VOICE_URL = '/voice/en-GB-v1/manifest.json';
export const VOICE_BUDGET = 8 * 1024 * 1024;
export interface VoiceClip {
  url: string;
  sha256: string;
  bytes: number;
  duration: number;
  transcript: string;
}
export interface VoicePack {
  schemaVersion: 1;
  version: string;
  sourceVersion: string;
  language: 'en-GB';
  voice: 'bf_emma';
  clips: Record<string, VoiceClip>;
  destinations: Record<string, string>;
  roads: Record<string, string>;
}
export interface GuidanceEvent {
  id: string;
  priority: 0 | 1 | 2; // routine, immediate turn/repeat, navigation state
  clips: string[];
  fallback: string[];
  routeId?: string;
  expiresAtProgress?: number;
  destination?: string;
  road?: string;
  suppresses?: string[];
}
export const normalizeVoiceName = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function validVoicePack(value: unknown): value is VoicePack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as VoicePack;
  if (
    pack.schemaVersion !== 1 ||
    pack.voice !== 'bf_emma' ||
    pack.language !== 'en-GB' ||
    typeof pack.version !== 'string' ||
    typeof pack.sourceVersion !== 'string' ||
    !pack.clips ||
    !pack.destinations ||
    !pack.roads ||
    [pack.clips, pack.destinations, pack.roads].some(
      (value) => typeof value !== 'object' || Array.isArray(value),
    )
  )
    return false;
  let bytes = 0;
  for (const clip of Object.values(pack.clips)) {
    if (
      !clip ||
      !/^\/voice\/en-GB-v1\/[a-f0-9]{24}\.mp3$/.test(clip.url) ||
      !/^[a-f0-9]{64}$/.test(clip.sha256) ||
      !Number.isSafeInteger(clip.bytes) ||
      clip.bytes <= 0 ||
      !Number.isFinite(clip.duration) ||
      clip.duration < 0.4 ||
      clip.duration > 25 ||
      typeof clip.transcript !== 'string' ||
      !clip.transcript
    )
      return false;
    bytes += clip.bytes;
  }
  return (
    bytes <= VOICE_BUDGET &&
    [
      'ready',
      'depart',
      'continue',
      'weak',
      'stale',
      'recovered',
      'rerouting',
      'rerouted',
      'route-unavailable',
      'off-route',
      'destination-ahead',
      'arrive-entrance',
      'arrive-approach',
    ].every((key) => !!pack.clips[key]) &&
    Object.values(pack.destinations).every(
      (key) => typeof key === 'string' && !!pack.clips[key],
    ) &&
    Object.values(pack.roads).every(
      (key) => typeof key === 'string' && /^[a-f0-9]{12}$/.test(key),
    )
  );
}

export function voiceClipKeys(event: GuidanceEvent, pack: VoicePack) {
  const road = event.road && pack.roads[normalizeVoiceName(event.road)];
  const keys = event.clips.map((key) =>
    road && pack.clips[`${key}:${road}`] ? `${key}:${road}` : key,
  );
  const destination =
    event.destination &&
    pack.destinations[normalizeVoiceName(event.destination)];
  if (destination) keys.push(destination);
  return keys;
}

export function distanceClip(metres: number): number | undefined {
  if (metres <= 0 || metres > 220) return undefined;
  const result = [10, 20, 30, 40, 50, 60, 100, 200].reduce((a, b) =>
    Math.abs(a - metres) <= Math.abs(b - metres) ? a : b,
  );
  return Math.abs(result - metres) <= Math.max(6, metres * 0.2)
    ? result
    : undefined;
}
export const turnKinds: ManeuverKind[] = [
  'left',
  'right',
  'slight-left',
  'slight-right',
  'uturn',
];
