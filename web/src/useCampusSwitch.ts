import { useEffect, useRef, useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import { activatePending, getPreference, loadCampus } from './offline';
import {
  campusUrl,
  rememberPublicCampus,
  requestedCampus,
  type CampusIdentity,
} from './campus-context';
import { flyToCampus } from './campus-flight';

export interface CampusSession {
  result: Awaited<ReturnType<typeof loadCampus>>;
  saved: string[];
  recent: string[];
  reportDrafts: {
    key: string;
    name: string;
    placeId?: string;
    coordinates: [number, number];
  }[];
}
interface Request {
  campus: CampusIdentity;
  url?: string;
}
interface Options {
  campuses: CampusIdentity[];
  active: string;
  map: MapInstance | null;
  threeD: boolean;
  navigating: boolean;
  onStop: () => Promise<void>;
  onCommit: (session: CampusSession) => void;
  onBrowse: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function useCampusSwitch(options: Options) {
  const current = useRef(options);
  current.current = options;
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [flying, setFlying] = useState(false);
  const [confirmation, setConfirmation] = useState<Request | null>(null);
  const retry = useRef<Request | null>(null);
  const abort = useRef<AbortController | null>(null);
  const revision = useRef({ value: 0 });
  const activeUrl = useRef(location.href);
  const flight = useRef<Request | null>(null);
  const stopFlight = useRef<(() => void) | undefined>(undefined);
  const frame = useRef(0);

  const fly = (campus: CampusIdentity) => {
    stopFlight.current?.();
    cancelAnimationFrame(frame.current);
    setFlying(true);
    frame.current = requestAnimationFrame(() => {
      const { map, threeD } = current.current;
      if (!map) {
        setFlying(false);
        return;
      }
      stopFlight.current = flyToCampus(map, campus.bounds, threeD, () =>
        setFlying(false),
      );
    });
  };
  const choose = async (
    campus: CampusIdentity,
    url?: string,
    confirmed = false,
  ) => {
    const request = { campus, url };
    const source = current.current;
    const sequence = ++revision.current.value;
    abort.current?.abort();
    stopFlight.current?.();
    cancelAnimationFrame(frame.current);
    flight.current = null;
    setPending('');
    setError('');
    setFlying(false);
    setConfirmation(null);
    retry.current = null;
    if (campus.slug === source.active) {
      source.onClose();
      source.onBrowse();
      fly(campus);
      return;
    }
    if (source.navigating && !confirmed) {
      setConfirmation(request);
      source.onConfirm();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    retry.current = request;
    setPending(campus.name);
    source.onClose();
    source.onBrowse();
    try {
      if (source.navigating) await source.onStop();
      controller.signal.throwIfAborted();
      await activatePending(campus.slug).catch(() => false);
      const [result, saved, recent, reportDrafts] = await Promise.all([
        loadCampus(campus.slug, controller.signal),
        getPreference('saved', [] as string[], campus.slug),
        getPreference('recent', [] as string[], campus.slug),
        getPreference(
          'report-drafts',
          [] as CampusSession['reportDrafts'],
          campus.slug,
        ),
      ]);
      if (controller.signal.aborted || sequence !== revision.current.value)
        return;
      const targetUrl = url || campusUrl('/', campus.slug);
      if (url) history.replaceState(history.state, '', targetUrl);
      else history.pushState(null, '', targetUrl);
      activeUrl.current = location.href;
      flight.current = request;
      current.current.onCommit({ result, saved, recent, reportDrafts });
      rememberPublicCampus(campus.slug);
      retry.current = null;
      setPending('');
      setFlying(true);
    } catch (cause) {
      if (controller.signal.aborted || sequence !== revision.current.value)
        return;
      setPending('');
      setError(
        `Could not open ${campus.name}. ${cause instanceof Error ? cause.message : 'Please retry.'}`,
      );
    }
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    if (flight.current?.campus.slug !== options.active) return;
    const campus = flight.current.campus;
    flight.current = null;
    fly(campus);
  }, [options.active]);
  useEffect(() => {
    const lifetime = revision.current;
    const changed = () => {
      const url = location.href;
      try {
        const slug = requestedCampus();
        if (slug === current.current.active) {
          lifetime.value++;
          abort.current?.abort();
          stopFlight.current?.();
          cancelAnimationFrame(frame.current);
          flight.current = null;
          retry.current = null;
          setPending('');
          setError('');
          setFlying(false);
          setConfirmation(null);
          activeUrl.current = url;
          return;
        }
        // Keep URL-scoped legacy consumers on the visible campus until commit.
        history.replaceState(history.state, '', activeUrl.current);
        const campus = current.current.campuses.find((c) => c.slug === slug);
        if (!campus)
          throw Error('This campus is not in the published directory.');
        void chooseRef.current(campus, url);
      } catch (cause) {
        history.replaceState(history.state, '', activeUrl.current);
        setError(
          cause instanceof Error ? cause.message : 'Invalid campus link.',
        );
      }
    };
    window.addEventListener('popstate', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      lifetime.value++;
      abort.current?.abort();
      cancelAnimationFrame(frame.current);
      stopFlight.current?.();
    };
  }, []);
  return {
    pending,
    error,
    flying,
    confirmation,
    choose,
    retry: () => {
      if (retry.current) void choose(retry.current.campus, retry.current.url);
    },
    confirm: () => {
      if (confirmation)
        void choose(confirmation.campus, confirmation.url, true);
    },
    dismiss: () => {
      setError('');
      setConfirmation(null);
    },
  };
}
