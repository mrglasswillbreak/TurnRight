import { useCallback, useEffect, useRef } from 'react';
import type { OfflineVoice } from './audio';
import { GuidanceController, type GuidanceInput } from './guidance';

export function useVoiceGuidance(
  voice: OfflineVoice,
  input: GuidanceInput | null,
  muted: boolean,
  onError: (message: string) => void,
) {
  const controller = useRef(new GuidanceController());
  const latest = useRef(input);
  latest.current = input;
  const suspended = useRef(false);
  const fallbackShown = useRef(false);
  const wasNavigating = useRef(false);
  const report = useRef(onError);
  report.current = onError;
  const update = useCallback(
    (force = false) => {
      const current = latest.current;
      voice.muted = muted;
      if (!current) {
        if (wasNavigating.current || muted || document.hidden) voice.stop();
        if (wasNavigating.current)
          controller.current = new GuidanceController();
        wasNavigating.current = false;
        suspended.current = false;
        fallbackShown.current = false;
        return;
      }
      wasNavigating.current = true;
      if (muted || document.hidden) {
        voice.stop();
        suspended.current = true;
        return;
      }
      const fresh = { ...current, now: Date.now() };
      const decision = controller.current.update(
        fresh,
        force || suspended.current,
      );
      suspended.current = false;
      voice.sync(fresh.route.id, fresh.nav.progress);
      // Repeat is an explicit restart of current guidance, including arrival
      // and GPS messages that have the same priority as active state speech.
      if (decision.cancel || force) voice.stop();
      voice.offer(decision.event, {
        started: () =>
          controller.current.acknowledge(decision.event!, Date.now()),
        error: (error) => {
          // A failed recording must not retry and toast on every GPS fix.
          controller.current.acknowledge(decision.event!, Date.now());
          report.current(error.message);
        },
        fallback: () => {
          if (!fallbackShown.current) {
            fallbackShown.current = true;
            report.current(
              'Using basic offline directions. The natural voice could not load.',
            );
          }
        },
      });
    },
    [muted, voice],
  );
  useEffect(() => {
    update();
  }, [input, update]);
  useEffect(() => {
    const visibility = () => update();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      voice.stop();
    };
  }, [voice, update]);
  return async () => {
    if (muted || document.hidden || !latest.current) return;
    try {
      await voice.unlock();
      update(true);
    } catch {
      report.current('Audio could not start. Check your device volume.');
    }
  };
}
