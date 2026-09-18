import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { OfflineVoice } from '../src/audio';
import {
  VOICE_URL,
  validVoicePack,
  voiceClipKeys,
  type GuidanceEvent,
  type VoicePack,
} from '../src/voice-model';

const started: FakeSource[] = [];
class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  stopped = false;
  connect() {}
  disconnect() {}
  start() {
    started.push(this);
  }
  stop() {
    this.stopped = true;
    this.onended?.();
  }
  finish() {
    this.onended?.();
  }
}
class FakeContext {
  state = 'running';
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createBufferSource() {
    return new FakeSource();
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    if (new TextDecoder().decode(bytes) === 'broken')
      throw new Error('decode failed');
    return { duration: 1, length: 24000, numberOfChannels: 1 } as AudioBuffer;
  }
}
const bytes = new Uint8Array([1, 2, 3]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const url = `/voice/en-GB-v1/${sha256.slice(0, 24)}.mp3`;
const keys = [
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
  'turn:left:30',
  'turn:right:now',
  'destination:law',
  'turn:left:30:123456789abc',
];
const pack: VoicePack = {
  schemaVersion: 1,
  version: 'test',
  sourceVersion: 'map',
  language: 'en-GB',
  voice: 'bf_emma',
  clips: Object.fromEntries(
    keys.map((key) => [
      key,
      { url, sha256, bytes: 3, duration: 1, transcript: key },
    ]),
  ),
  destinations: { 'faculty of law': 'destination:law' },
  roads: { 'law road': '123456789abc' },
};
const cue = (id = 'soon', priority: 0 | 1 | 2 = 0): GuidanceEvent => ({
  id,
  priority,
  clips: ['turn:left:30'],
  fallback: ['left'],
  routeId: 'a',
  expiresAtProgress: 105,
});
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  started.length = 0;
  vi.stubGlobal('AudioContext', FakeContext);
  request = vi.fn(async (input: string) => {
    if (input === VOICE_URL) return new Response(JSON.stringify(pack));
    if (input.endsWith('audio.json'))
      return new Response(
        JSON.stringify({
          left: '/audio/abc/left.wav',
          ready: '/audio/abc/ready.wav',
        }),
      );
    return new Response(bytes);
  });
  vi.stubGlobal('fetch', request);
});
afterEach(() => vi.unstubAllGlobals());
async function ready() {
  const voice = new OfflineVoice();
  await voice.unlock();
  await voice.load('campus');
  return voice;
}
const playing = (count: number) =>
  vi.waitFor(() => expect(started).toHaveLength(count));

describe('offline voice playback', () => {
  it('serializes routine prompts and only keeps the newest waiting cue', async () => {
    const voice = await ready(),
      first = vi.fn(),
      latest = vi.fn(),
      replaced = vi.fn();
    voice.offer(cue('a'), { started: first });
    await playing(1);
    voice.offer(cue('b'), { started: replaced });
    voice.offer(cue('c'), { started: latest });
    expect(started[0].stopped).toBe(false);
    started[0].finish();
    await playing(2);
    expect(first).toHaveBeenCalledOnce();
    expect(replaced).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    voice.stop();
  });
  it('immediate turns interrupt routine audio and urgent state changes interrupt both', async () => {
    const voice = await ready();
    voice.offer(cue());
    await playing(1);
    voice.offer(cue('now', 1));
    await playing(2);
    expect(started[0].stopped).toBe(true);
    voice.offer({ ...cue('weak', 2), clips: ['weak'] });
    await playing(3);
    expect(started[1].stopped).toBe(true);
    voice.stop();
  });
  it('deduplicates the active announcement and drops stale route or passed-turn audio', async () => {
    const voice = await ready();
    voice.offer(cue());
    await playing(1);
    voice.offer(cue());
    expect(started).toHaveLength(1);
    voice.sync('a', 106);
    expect(started[0].stopped).toBe(true);
    voice.offer(cue('new'));
    await playing(2);
    voice.sync('b', 0);
    expect(started[1].stopped).toBe(true);
  });
  it('cannot play a delayed download after stop or a route change', async () => {
    let release!: (response: Response) => void;
    const voice = await ready();
    request.mockImplementation((input: string) =>
      input === url
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(new Response(bytes)),
    );
    const onStart = vi.fn();
    voice.offer(cue(), { started: onStart });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    voice.stop();
    release(new Response(bytes));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started).toHaveLength(0);
    expect(onStart).not.toHaveBeenCalled();
  });
  it('stops immediately when muted and can play again after unmuting', async () => {
    const voice = await ready();
    voice.offer(cue());
    await playing(1);
    voice.muted = true;
    voice.offer(cue('muted'));
    expect(started[0].stopped).toBe(true);
    voice.muted = false;
    voice.offer(cue('resumed'));
    await playing(2);
    voice.stop();
  });
  it('uses the basic downloaded clips if the pack or a recording fails', async () => {
    request.mockImplementation(async (input: string) => {
      if (input === VOICE_URL)
        return new Response('unavailable', { status: 503 });
      if (input.endsWith('audio.json'))
        return new Response(JSON.stringify({ left: '/audio/abc/left.wav' }));
      return new Response(bytes);
    });
    const voice = await ready(),
      fallback = vi.fn();
    voice.offer(cue(), { fallback });
    await playing(1);
    expect(fallback).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      '/audio/abc/left.wav',
      expect.anything(),
    );
    voice.stop();
  });
  it('falls back when an individual natural recording is corrupt', async () => {
    const voice = await ready(),
      fallback = vi.fn();
    request.mockImplementation(
      async (input: string) =>
        new Response(input === url ? new Uint8Array([9, 8, 7]) : bytes),
    );
    voice.offer(cue(), { fallback });
    await playing(1);
    expect(fallback).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      '/audio/abc/left.wav',
      expect.anything(),
    );
    voice.stop();
  });
  it('reports preview cancellation and can preview again', async () => {
    const voice = await ready();
    const preview = voice.preview();
    const rejected = expect(preview).rejects.toThrow('stopped');
    await playing(1);
    voice.stop();
    await rejected;
    const retry = voice.preview();
    await playing(2);
    started[1].finish();
    await retry;
  });
  it('verifies clip integrity and reports a failure when neither voice can play', async () => {
    const voice = await ready(),
      error = vi.fn(),
      fallback = vi.fn();
    request.mockImplementation(async () => new Response('broken'));
    voice.offer(cue(), { error, fallback });
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(started).toHaveLength(0);
    expect(fallback).not.toHaveBeenCalled();
  });
  it('previews the natural voice and rejects unavailable audio rather than reporting success', async () => {
    const voice = await ready();
    const preview = voice.preview();
    await playing(1);
    started[0].finish();
    await preview;
    voice.muted = true;
    await expect(voice.preview()).rejects.toThrow('Unmute');
  });
  it('uses recorded names when available and safely omits new names', () => {
    expect(
      voiceClipKeys(
        { ...cue(), destination: ' Faculty  Of Law ', road: 'LAW road' },
        pack,
      ),
    ).toEqual(['turn:left:30:123456789abc', 'destination:law']);
    expect(
      voiceClipKeys(
        { ...cue(), destination: 'New place', road: 'New path' },
        pack,
      ),
    ).toEqual(['turn:left:30']);
    expect(validVoicePack(pack)).toBe(true);
    const invalid = structuredClone(pack);
    invalid.clips.ready.url = 'https://external.example/voice.mp3';
    expect(validVoicePack(invalid)).toBe(false);
  });
});
