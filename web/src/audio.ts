import {
  VOICE_URL,
  validVoicePack,
  voiceClipKeys,
  type GuidanceEvent,
  type VoiceClip,
  type VoicePack,
} from './voice-model';

type Request = {
  event: GuidanceEvent;
  started?: () => void;
  error?: (error: Error) => void;
  fallback?: () => void;
};
const BUFFER_LIMIT = 12 * 1024 * 1024;

/** Offline playback with one current announcement and one replaceable pending cue. */
export class OfflineVoice {
  private context: AudioContext | null = null;
  private pack: VoicePack | null = null;
  private legacy: Record<string, string> = {};
  private buffers = new Map<string, AudioBuffer>();
  private generation = 0;
  private loadGeneration = 0;
  private loading: Promise<unknown> = Promise.resolve();
  private active: Request | null = null;
  private pending: Request | null = null;
  private current: AudioBufferSourceNode | null = null;
  private endCurrent: (() => void) | null = null;
  muted = false;

  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  load(version: string): Promise<'natural' | 'basic'> {
    const revision = ++this.loadGeneration;
    const task = (async () => {
      const [natural, basic] = await Promise.allSettled([
        fetch(VOICE_URL, { signal: AbortSignal.timeout(15000) }).then(
          async (response) => {
            if (!response.ok) throw new Error('Natural voice unavailable');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 512 * 1024)
              throw new Error('Invalid voice manifest');
            const pack: unknown = JSON.parse(new TextDecoder().decode(bytes));
            if (!validVoicePack(pack)) throw new Error('Invalid voice pack');
            return pack;
          },
        ),
        fetch(`/packages/${encodeURIComponent(version)}/audio.json`, {
          signal: AbortSignal.timeout(15000),
        }).then(async (response) => {
          if (!response.ok) throw new Error('Basic voice unavailable');
          const clips: unknown = await response.json();
          if (
            !clips ||
            typeof clips !== 'object' ||
            Object.values(clips).some(
              (url) =>
                typeof url !== 'string' ||
                !/^\/audio\/[a-f0-9]+\/[a-z0-9-]+\.wav$/.test(url),
            )
          )
            throw new Error('Invalid basic voice manifest');
          return clips as Record<string, string>;
        }),
      ]);
      if (revision === this.loadGeneration) {
        this.pack = natural.status === 'fulfilled' ? natural.value : null;
        this.legacy = basic.status === 'fulfilled' ? basic.value : {};
      }
      if (natural.status === 'fulfilled') return 'natural' as const;
      if (basic.status === 'fulfilled') return 'basic' as const;
      throw new Error(
        'Voice files unavailable. Save the app and download the campus map before going offline.',
      );
    })();
    this.loading = task.catch(() => {});
    return task;
  }
  stop() {
    this.generation++;
    this.pending = null;
    this.active = null;
    const current = this.current;
    this.current = null;
    try {
      current?.stop();
    } catch {
      /* already ended */
    }
    this.endCurrent?.();
    this.endCurrent = null;
  }
  sync(routeId: string, progress: number) {
    const stale = (request: Request) =>
      (request.event.routeId !== undefined &&
        request.event.routeId !== routeId) ||
      (request.event.expiresAtProgress !== undefined &&
        progress > request.event.expiresAtProgress);
    if (this.active && stale(this.active)) this.stop();
    if (this.pending && stale(this.pending)) this.pending = null;
  }
  offer(
    event: GuidanceEvent | undefined,
    callbacks: Omit<Request, 'event'> = {},
  ) {
    if (this.muted) {
      this.stop();
      return;
    }
    if (!event) {
      this.pending = null;
      return;
    }
    if (
      this.active?.event.id === event.id ||
      this.pending?.event.id === event.id
    )
      return;
    const request = { event, ...callbacks };
    if (this.active && event.priority <= this.active.event.priority) {
      this.pending = request;
      void this.prepare(event).catch(() => {});
      return;
    }
    if (this.active) this.stop();
    this.active = request;
    void this.run(request, this.generation);
  }
  async preview() {
    await this.unlock();
    if (this.muted)
      throw new Error('Unmute voice directions to play the preview.');
    this.stop();
    return new Promise<void>((resolve, reject) => {
      const request: Request = {
        event: {
          id: 'preview',
          priority: 2,
          clips: ['ready'],
          fallback: ['ready'],
        },
        error: reject,
      };
      this.active = request;
      const generation = this.generation;
      void this.run(request, generation).then(() => {
        if (generation === this.generation) resolve();
        else reject(new Error('Voice preview stopped.'));
      }, reject);
    });
  }
  private async buffer(url: string, clip?: VoiceClip): Promise<AudioBuffer> {
    if (!this.context) throw new Error('Audio has not been enabled');
    const cached = this.buffers.get(url);
    if (cached) {
      this.buffers.delete(url);
      this.buffers.set(url, cached);
      return cached;
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('A voice recording could not load');
    const bytes = await response.arrayBuffer();
    if (clip) {
      if (bytes.byteLength !== clip.bytes)
        throw new Error('Voice recording size mismatch');
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== clip.sha256)
        throw new Error('Voice recording integrity check failed');
    }
    const buffer = await this.context.decodeAudioData(bytes);
    if (clip && Math.abs(buffer.duration - clip.duration) > 0.2)
      throw new Error('Invalid voice recording duration');
    this.buffers.set(url, buffer);
    let total = [...this.buffers.values()].reduce(
      (sum, b) => sum + b.length * b.numberOfChannels * 4,
      0,
    );
    for (const [key, old] of this.buffers) {
      if (total <= BUFFER_LIMIT || key === url) break;
      this.buffers.delete(key);
      total -= old.length * old.numberOfChannels * 4;
    }
    return buffer;
  }
  private async prepare(
    event: GuidanceEvent,
  ): Promise<{ buffers: AudioBuffer[]; fallback: boolean }> {
    await this.loading;
    if (this.pack) {
      try {
        const clips = voiceClipKeys(event, this.pack).map(
          (key) => this.pack!.clips[key],
        );
        if (clips.some((clip) => !clip))
          throw new Error('Missing natural voice phrase');
        return {
          buffers: await Promise.all(
            clips.map((clip) => this.buffer(clip.url, clip)),
          ),
          fallback: false,
        };
      } catch {
        /* Keep basic downloaded directions if the new pack fails. */
      }
    }
    const urls = event.fallback.map((key) => this.legacy[key]);
    if (!urls.length || urls.some((url) => !url))
      throw new Error('Audio unavailable; follow the on-screen directions.');
    return {
      buffers: await Promise.all(urls.map((url) => this.buffer(url))),
      fallback: true,
    };
  }
  private async run(request: Request, generation: number) {
    const valid = () =>
      generation === this.generation && !this.muted && this.active === request;
    try {
      const prepared = await this.prepare(request.event);
      if (!valid()) return;
      if (!this.context || this.context.state !== 'running')
        throw new Error(
          'Audio is paused. Tap Repeat to enable spoken directions.',
        );
      if (prepared.fallback) request.fallback?.();
      let started = false;
      for (const buffer of prepared.buffers) {
        if (!valid()) return;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        this.current = source;
        await new Promise<void>((resolve) => {
          let ended = false;
          const end = () => {
            if (ended) return;
            ended = true;
            source.disconnect();
            resolve();
          };
          source.onended = end;
          this.endCurrent = end;
          source.start();
          if (!started) {
            started = true;
            request.started?.();
          }
        });
        if (!valid()) return;
        this.current = null;
        this.endCurrent = null;
      }
    } catch (error) {
      if (valid())
        request.error?.(
          error instanceof Error ? error : new Error('Audio could not play.'),
        );
    } finally {
      if (valid()) {
        this.active = null;
        const next = this.pending;
        this.pending = null;
        if (next) {
          this.active = next;
          void this.run(next, generation);
        }
      }
    }
  }
}
