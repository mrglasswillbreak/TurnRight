import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  validVoicePack,
  VOICE_BUDGET,
  normalizeVoiceName,
  type VoicePack,
} from '../src/voice-model';

const folder = path.resolve('public/voice/en-GB-v1');
const pack: VoicePack & {
  sourceSha256: string;
  modelChecksums: Record<string, string>;
} = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
const catalogue = JSON.parse(
  fs.readFileSync('../data/voice/catalogue.json', 'utf8'),
);
describe('bundled natural voice', () => {
  it('has every approved transcript and stays inside the total offline budget', () => {
    expect(validVoicePack(pack)).toBe(true);
    expect(pack.sourceVersion).toBe(catalogue.sourceVersion);
    expect(pack.sourceSha256).toBe(catalogue.sourceSha256);
    expect(Object.keys(pack.clips).sort()).toEqual(
      Object.keys(catalogue.phrases).sort(),
    );
    for (const [key, phrase] of Object.entries(catalogue.phrases) as [
      string,
      { transcript: string; spoken: string },
    ][]) {
      expect(pack.clips[key].transcript).toBe(phrase.transcript);
      expect(phrase.spoken.trim().length).toBeGreaterThan(5);
    }
    const names = fs.readdirSync(folder);
    expect(
      names.reduce(
        (sum, name) => sum + fs.statSync(path.join(folder, name)).size,
        0,
      ),
    ).toBeLessThanOrEqual(VOICE_BUDGET);
    expect(names.filter((name) => name.endsWith('.mp3')).sort()).toEqual(
      [
        ...new Set(
          Object.values(pack.clips).map((clip) => path.basename(clip.url)),
        ),
      ].sort(),
    );
  });
  it('verifies every immutable recording and model checksum', () => {
    for (const clip of Object.values(pack.clips) as {
      url: string;
      sha256: string;
      bytes: number;
      duration: number;
    }[]) {
      const bytes = fs.readFileSync(path.join('public', clip.url));
      expect(bytes.length).toBe(clip.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        clip.sha256,
      );
      expect(clip.url).toContain(clip.sha256.slice(0, 24));
      expect(clip.duration).toBeGreaterThanOrEqual(0.4);
      expect(clip.duration).toBeLessThanOrEqual(25);
    }
    expect(pack.modelChecksums['kokoro-v1_0.pth']).toBe(
      '496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4',
    );
    expect(pack.modelChecksums['voices/bf_emma.pt']).toBe(
      'd0a423deabf4a52b4f49318c51742c54e21bb89bbbe9a12141e7758ddb5da701',
    );
  });
  it('covers normalized published names and excludes generic roads', () => {
    expect(pack.destinations).toEqual(catalogue.destinations);
    expect(pack.roads).toEqual(catalogue.roads);
    for (const name of Object.keys(pack.destinations))
      expect(normalizeVoiceName(name)).toBe(name);
    expect(pack.roads['campus path']).toBeUndefined();
    expect(pack.roads['campus road']).toBeUndefined();
    for (const road of Object.values(pack.roads))
      for (const kind of [
        'left',
        'right',
        'slight-left',
        'slight-right',
        'uturn',
        'straight',
      ])
        for (const phase of ['now', 10, 20, 30, 40, 50, 60, 100, 200])
          expect(pack.clips[`turn:${kind}:${phase}:${road}`]).toBeDefined();
  });
});
