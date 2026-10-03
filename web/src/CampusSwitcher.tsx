import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Globe2, MapPin, Search } from 'lucide-react';
import type { Map as MapInstance } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { loadCampusCatalogue } from './campus-catalogue';
import { frameGlobe } from './world-camera';
import { publicMapPadding } from './public-map-layout';
import { type CampusIdentity } from './campus-context';
import { campusCenter, installCampusOverview } from './campus-overview';
import { useCampusSwitch, type CampusSession } from './useCampusSwitch';

export default function CampusSwitcher({
  map,
  navigating = false,
  onStop,
  campus,
  dark,
  threeD,
  onOpenChange,
  onBrowse,
  onCommit,
}: {
  map: MapInstance | null;
  navigating?: boolean;
  onStop: () => Promise<void>;
  campus: CampusIdentity;
  dark: boolean;
  threeD: boolean;
  onOpenChange: (active: boolean) => void;
  onBrowse: () => void;
  onCommit: (session: CampusSession) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [campuses, setCampuses] = useState<CampusIdentity[]>([campus]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [directoryError, setDirectoryError] = useState('');
  const [overlaps, setOverlaps] = useState<CampusIdentity[]>([]);
  const browse = useRef(false);
  const transition = useCampusSwitch({
    campuses,
    active: campus.slug,
    map,
    threeD,
    navigating,
    onStop,
    onCommit,
    onBrowse,
    onClose: () => {
      setOpen(false);
      setOverlaps([]);
    },
    onConfirm: () => {
      browse.current = false;
      setOpen(true);
    },
  });
  const callbacks = useRef({ transition, onBrowse, campus });
  callbacks.current = { transition, onBrowse, campus };
  useEffect(() => {
    onOpenChange(open || !!transition.pending || transition.flying);
  }, [open, transition.pending, transition.flying, onOpenChange]);
  useEffect(() => {
    let cancelled = false;
    void loadCampusCatalogue()
      .then((directory) => {
        if (!cancelled) {
          setCampuses(directory.campuses);
          setDirectoryError('');
        }
      })
      .catch((error) => {
        if (!cancelled) setDirectoryError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const style = document.documentElement.style;
    const resize = () => {
      style.setProperty(
        '--campus-visible-height',
        `${viewport?.height ?? innerHeight}px`,
      );
      style.setProperty(
        '--campus-keyboard-offset',
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      style.removeProperty('--campus-visible-height');
      style.removeProperty('--campus-keyboard-offset');
    };
  }, [open]);
  useEffect(() => {
    if (!map || navigating) return;
    let frame = 0;
    if (!open) {
      const refresh = () => {
        frame = requestAnimationFrame(() => {
          if (map.getZoom() < 12 && !map.isMoving())
            map.setPadding(publicMapPadding(map.getContainer(), true));
        });
      };
      if (map.isMoving()) map.once('moveend', refresh);
      else refresh();
      return () => {
        cancelAnimationFrame(frame);
        map.off('moveend', refresh);
      };
    }
    if (!browse.current) return;
    let framed = false;
    const attempt = () => {
      if (
        framed ||
        !map.getLayer('world-country-labels') ||
        map.getMinZoom() > 0
      )
        return;
      framed = true;
      callbacks.current.onBrowse();
      frameGlobe(map, campusCenter(callbacks.current.campus.bounds));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(attempt);
    };
    schedule();
    map.on('styledata', schedule);
    map.on('idle', schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off('styledata', schedule);
      map.off('idle', schedule);
    };
  }, [open, map, navigating]);
  useEffect(() => {
    if (!map) return;
    let dispose: (() => void) | undefined;
    const install = () => {
      if (
        dispose ||
        map.getSource('published-campuses') ||
        !map.getLayer('campus-fill')
      )
        return;
      const activeCampus = callbacks.current.campus;
      // Old directories still show the active campus's already loaded boundary.
      dispose = installCampusOverview(
        map,
        campuses.map((c) =>
          c.slug === activeCampus.slug && !c.outline
            ? { ...c, outline: activeCampus.outline }
            : c,
        ),
        activeCampus.slug,
        dark,
        (choices) => {
          if (choices.length === 1)
            void callbacks.current.transition.choose(choices[0]);
          else {
            browse.current = false;
            setQuery('');
            setOverlaps(choices);
            setOpen(true);
          }
        },
      );
    };
    install();
    map.on('styledata', install);
    return () => {
      map.off('styledata', install);
      dispose?.();
    };
  }, [map, campuses, campus.slug, campus.outline, dark]);
  return (
    <>
      <Button
        ref={trigger}
        className="public-campus-switcher"
        variant="outline"
        aria-label="Choose a campus"
        title="Choose a campus"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          browse.current = true;
          setOverlaps([]);
          setQuery('');
          setOpen(true);
        }}
      >
        <Globe2 size={20} />
        <span className="sr-only">Campuses</span>
      </Button>
      {(transition.pending || transition.error) &&
        createPortal(
          <output className="campus-switch-status" aria-live="polite">
            <span>
              {transition.pending
                ? `Opening ${transition.pending}…`
                : transition.error}
            </span>
            {transition.error && (
              <>
                <Button size="sm" onClick={transition.retry}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={transition.dismiss}>
                  Dismiss
                </Button>
              </>
            )}
          </output>,
          document.body,
        )}
      <Dialog
        modal={false}
        open={open}
        onOpenChange={(value, details) => {
          // The globe remains interactive while this discovery panel is open.
          if (!value && details.reason === 'outside-press') return;
          setOpen(value);
          if (!value) {
            setOverlaps([]);
            transition.dismiss();
          }
        }}
      >
        <DialogContent
          positioning="viewport"
          className="campus-chooser rounded-xl"
          data-campus-open={open}
          initialFocus={() =>
            matchMedia('(max-width: 599px)').matches ? title.current : true
          }
          finalFocus={trigger}
          overlayClassName="campus-chooser-backdrop"
        >
          <DialogHeader>
            <DialogTitle ref={title} tabIndex={-1}>
              {overlaps.length ? 'Choose a campus here' : 'Choose a campus'}
            </DialogTitle>
            <DialogDescription>
              Choose a campus below or select its silhouette on the globe. Each
              campus has its own places, routes and offline download.
            </DialogDescription>
          </DialogHeader>
          <label className="campus-public-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search published campuses"
              placeholder="Search campus names"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {directoryError && <output>{directoryError}</output>}
          <div className="campus-public-list">
            {(overlaps.length ? overlaps : campuses)
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="campus-public-option"
                  aria-current={c.slug === campus.slug ? 'true' : undefined}
                  onClick={() => void transition.choose(c)}
                >
                  <MapPin size={18} />
                  <span>{c.name}</span>
                  {c.slug === campus.slug && <Check size={17} />}
                </Button>
              ))}
          </div>
          {overlaps.length > 0 && (
            <Button variant="ghost" onClick={() => setOverlaps([])}>
              Show all campuses
            </Button>
          )}
          {transition.confirmation && (
            <div className="campus-public-confirm">
              <p>
                Stop directions and open{' '}
                <strong>{transition.confirmation.campus.name}</strong>?
              </p>
              <Button onClick={transition.confirm}>
                Stop and switch campus
              </Button>
              <Button variant="ghost" onClick={transition.dismiss}>
                Keep directions
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
