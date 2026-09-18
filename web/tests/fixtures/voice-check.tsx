// Local Vite-only acceptance harness. Not an input to the production build.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OfflineVoice } from '../../src/audio';
import { useVoiceGuidance } from '../../src/useVoiceGuidance';
import { initialNavigation } from '../../src/navigation';
import type { GuidanceInput } from '../../src/guidance';
import type { GuidanceEvent } from '../../src/voice-model';
import type { Route } from '../../src/types';

const actualHidden = () => document.visibilityState === 'hidden';
let simulatedHidden = false;
Object.defineProperty(document, 'hidden', {
  configurable: true,
  get: () => simulatedHidden || actualHidden(),
});
const visibility = (hidden: boolean) => {
  simulatedHidden = hidden;
  document.dispatchEvent(new Event('visibilitychange'));
};
const log = (message: string) => {
  const node = document.getElementById('log');
  if (node)
    node.textContent = `${new Date().toLocaleTimeString()} ${message}\n${node.textContent}`;
};
class AuditedVoice extends OfflineVoice {
  override offer(
    event: GuidanceEvent | undefined,
    callbacks: Parameters<OfflineVoice['offer']>[1] = {},
  ) {
    super.offer(event, {
      ...callbacks,
      started: () => {
        log(
          `PLAY ${event?.id}: ${event?.clips.join(', ')}${event?.destination ? ` · ${event.destination}` : ''}`,
        );
        callbacks.started?.();
      },
    });
  }
  override stop() {
    log('CANCEL');
    super.stop();
  }
}
const route: Route = {
  id: 'walk',
  edgeIds: [],
  nodeIds: [],
  distance: 160,
  seconds: 128,
  startOffset: 0,
  coordinates: [
    [3.2, 6.46],
    [3.20145, 6.46],
  ],
  maneuvers: [
    {
      kind: 'depart',
      at: 0,
      instruction: 'Start walking',
      coordinates: [3.2, 6.46],
      street: '',
    },
    {
      kind: 'left',
      at: 100,
      instruction: 'Turn left onto LAW road',
      coordinates: [3.2009, 6.46],
      street: 'LAW road',
    },
    {
      kind: 'right',
      at: 120,
      instruction: 'Turn right',
      coordinates: [3.2011, 6.46],
      street: 'Campus path',
    },
    {
      kind: 'arrive',
      at: 160,
      instruction: 'End of mapped route',
      coordinates: [3.20145, 6.46],
      street: '',
    },
  ],
};
function input(progress = 0): GuidanceInput {
  return {
    route,
    nav: { ...initialNavigation, progress },
    fix: {
      coordinates: [3.2, 6.46],
      accuracy: 5,
      speed: 1.25,
      heading: 0,
      timestamp: Date.now(),
    },
    now: Date.now(),
    destination: 'Faculty Of Law',
    arrivalKind: 'mapped-approach',
    rerouting: false,
    routeFailed: false,
  };
}
function Check() {
  const voice = useRef(new AuditedVoice()).current;
  const [current, setCurrent] = useState<GuidanceInput | null>(null);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('Loading recordings');
  const repeat = useVoiceGuidance(voice, current, muted, log);
  useEffect(() => {
    void fetch('/packages/latest.json')
      .then((r) => r.json())
      .then((m) => voice.load(m.version))
      .then(setStatus)
      .catch((e) => setStatus(e.message));
  }, [voice]);
  useEffect(() => {
    const tick = setInterval(
      () => setCurrent((old) => old && { ...old, now: Date.now() }),
      1000,
    );
    return () => clearInterval(tick);
  }, []);
  const step = (progress: number, index: number) =>
    setCurrent((old) => ({
      ...input(progress),
      route: old?.route || route,
      nav: { ...initialNavigation, progress, nextIndex: index },
    }));
  const change = (patch: Partial<GuidanceInput>) =>
    setCurrent((old) => ({ ...(old || input(70)), ...patch }));
  return (
    <main
      style={{
        font: '16px system-ui',
        margin: '20px auto',
        padding: 12,
        maxWidth: 800,
      }}
    >
      <h1>Offline voice check</h1>
      <p>
        Local test controls. Actual recorded audio and production guidance hook;
        synthetic GPS only.
      </p>
      <output style={{ display: 'block', marginBottom: 12 }}>
        Voice: {status}.{' '}
        {current
          ? `Progress ${current.nav.progress} m; ${muted ? 'muted' : 'speaking enabled'}`
          : 'No active walk'}
      </output>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button
          onClick={async () => {
            await voice.unlock();
            setCurrent(input());
          }}
        >
          Start walk
        </button>
        <button onClick={() => step(70, 1)}>30 m before close turns</button>
        <button onClick={() => step(95, 1)}>At left turn</button>
        <button onClick={() => step(107, 2)}>Between turns</button>
        <button onClick={() => step(115, 2)}>At right turn</button>
        <button
          onClick={() => change({ fix: { ...input().fix!, accuracy: 50 } })}
        >
          Poor GPS
        </button>
        <button onClick={() => change({ fix: input().fix })}>
          Good GPS fix
        </button>
        <button
          onClick={() =>
            change({ fix: { ...input().fix!, timestamp: Date.now() - 13000 } })
          }
        >
          GPS stopped
        </button>
        <button
          onClick={() =>
            change({
              ...input(70),
              nav: {
                ...initialNavigation,
                progress: 70,
                offRouteSince: Date.now(),
              },
            })
          }
        >
          Off route
        </button>
        <button onClick={() => change({ ...input(70), rerouting: true })}>
          Rerouting
        </button>
        <button
          onClick={() =>
            change({
              ...input(70),
              route: { ...route, id: `replacement-${Date.now()}` },
            })
          }
        >
          Replacement route
        </button>
        <button onClick={() => step(154, 3)}>Near destination</button>
        <button
          onClick={() =>
            change({
              ...input(158),
              nav: {
                ...initialNavigation,
                progress: 158,
                nextIndex: 3,
                arrived: true,
                arrivalFixes: 3,
              },
            })
          }
        >
          Confirmed approach arrival
        </button>
        <button
          onClick={() =>
            change({
              ...input(158),
              arrivalKind: 'entrance',
              nav: {
                ...initialNavigation,
                progress: 158,
                nextIndex: 3,
                arrived: true,
                arrivalFixes: 3,
              },
            })
          }
        >
          Confirmed entrance arrival
        </button>
        <button onClick={repeat}>Repeat</button>
        <button onClick={() => setMuted((value) => !value)}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button onClick={() => setCurrent(null)}>Stop</button>
        <button
          onClick={() =>
            void voice.preview().then(
              () => log('Preview complete'),
              (e) => log(e.message),
            )
          }
        >
          Preview
        </button>
        <button onClick={() => setStatus('Re-rendered while preview plays')}>
          Re-render idle UI
        </button>
      </div>
      <p>
        <button onClick={() => visibility(true)}>Simulate background</button>{' '}
        <button onClick={() => visibility(false)}>Simulate foreground</button>
      </p>
      <h2>Playback events</h2>
      <pre id="log" aria-live="polite" style={{ whiteSpace: 'pre-wrap' }} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Check />);
