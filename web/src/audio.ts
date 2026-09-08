import type { ManeuverKind } from './types';
export class OfflineVoice {
 private context: AudioContext | null = null;
 private clips: Record<string, string> = {};
 private buffers = new Map<string, AudioBuffer>();
 private generation = 0;
 private current: AudioBufferSourceNode | null = null;
 muted = false;
 async unlock() {
  this.context ??= new AudioContext();
  await this.context.resume();
 }
 async load(version: string) {
  const response = await fetch(`/packages/${version}/audio.json`);
  if (!response.ok) throw new Error('Voice files unavailable. Download the campus map to use audio offline.');
  this.clips = await response.json();
 }
 stop() { this.generation++; try { this.current?.stop(); } catch { /* already ended */ } this.current = null; }
 async play(...names: string[]) {
  if (this.muted) return;
  this.stop(); const generation = this.generation;
  if (!this.context || this.context.state !== 'running') return;
  for (const name of names) {
   const url = this.clips[name]; if (!url || generation !== this.generation) return;
   let buffer = this.buffers.get(url);
   if (!buffer) {
    const response = await fetch(url); if (!response.ok) throw new Error('A voice clip could not load.');
    buffer = await this.context.decodeAudioData(await response.arrayBuffer()); this.buffers.set(url, buffer);
   }
   if (generation !== this.generation || this.muted) return;
   const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination); this.current = source;
   await new Promise<void>(resolve => { source.onended = () => resolve(); source.start(); });
  }
 }
 maneuver(kind: ManeuverKind, meters?: number) {
  const prefix = meters && meters >= 15 ? `in-${[20, 30, 50, 100, 200].reduce((best, n) => Math.abs(n - meters) < Math.abs(best - meters) ? n : best, 20)}` : null;
  return this.play(...(prefix ? [prefix, kind] : [kind]));
 }
}
