import { useEffect, useState } from 'react';
import { Check, Globe2, MapPin, Search } from 'lucide-react';
import type { Map as MapInstance, MapLayerMouseEvent } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { loadCampusCatalogue } from './campus-catalogue';
import {
  campusUrl,
  lasuCampus,
  requestedCampus,
  type CampusIdentity,
} from './campus-context';

export default function CampusSwitcher({
  map,
  navigating = false,
  onStop,
}: {
  map: MapInstance | null;
  navigating?: boolean;
  onStop: () => Promise<void>;
}) {
  const [campuses, setCampuses] = useState<CampusIdentity[]>([lasuCampus]),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [choice, setChoice] = useState<CampusIdentity | null>(null);
  useEffect(() => {
    void loadCampusCatalogue()
      .then((c) => setCampuses(c.campuses))
      .catch((e) => setError(e.message));
  }, []);
  const choose = (campus: CampusIdentity) => {
    if (campus.slug === requestedCampus()) {
      setOpen(false);
      return;
    }
    if (navigating) {
      setChoice(campus);
      setOpen(true);
      return;
    }
    location.assign(campusUrl('/', campus.slug));
  };
  useEffect(() => {
    if (!map) return;
    const install = () => {
      if (map.getSource('published-campuses')) return;
      map.addSource('published-campuses', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: campuses.map((c) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                (c.bounds[0][0] + c.bounds[1][0]) / 2,
                (c.bounds[0][1] + c.bounds[1][1]) / 2,
              ],
            },
            properties: { id: c.id, name: c.name },
          })),
        },
      });
      map.addLayer({
        id: 'published-campus-pins',
        type: 'circle',
        source: 'published-campuses',
        maxzoom: 12,
        paint: {
          'circle-radius': 7,
          'circle-color': '#0d9488',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'published-campus-labels',
        type: 'symbol',
        source: 'published-campuses',
        minzoom: 3,
        maxzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.6],
          'text-font': ['Open Sans Semibold'],
        },
        paint: {
          'text-color': '#0f766e',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
        },
      });
    };
    const click = (e: MapLayerMouseEvent) => {
      const campus = campuses.find(
        (c) => c.id === e.features?.[0].properties?.id,
      );
      if (campus) {
        setChoice(campus);
        setOpen(true);
      }
    };
    if (map.isStyleLoaded()) install();
    else map.once('load', install);
    map.on('click', 'published-campus-pins', click);
    return () => {
      map.off('load', install);
      map.off('click', 'published-campus-pins', click);
      if (map.getLayer('published-campus-labels'))
        map.removeLayer('published-campus-labels');
      if (map.getLayer('published-campus-pins'))
        map.removeLayer('published-campus-pins');
      if (map.getSource('published-campuses'))
        map.removeSource('published-campuses');
    };
  }, [map, campuses]);
  return (
    <>
      <Button
        className="public-campus-switcher"
        variant="outline"
        aria-label="Choose a campus"
        onClick={() => setOpen(true)}
      >
        <Globe2 size={17} />
        <span>Campuses</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setChoice(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a campus</DialogTitle>
            <DialogDescription>
              Explore published maps. Each campus has its own places, routes and
              offline download.
            </DialogDescription>
          </DialogHeader>
          <label className="campus-public-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search published campuses"
              placeholder="Search campus names"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {error && <output>{error}</output>}
          <div className="campus-public-list">
            {campuses
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="campus-public-option"
                  onClick={() => choose(c)}
                >
                  <MapPin size={18} />
                  <span>{c.name}</span>
                  {c.slug === requestedCampus() && <Check size={17} />}
                </Button>
              ))}
          </div>
          {choice && (
            <div className="campus-public-confirm">
              <p>
                {navigating ? 'Stop directions and open' : 'Open'}{' '}
                <strong>{choice.name}</strong>?
              </p>
              <Button
                onClick={() =>
                  void (async () => {
                    if (navigating) await onStop();
                    location.assign(campusUrl('/', choice.slug));
                  })()
                }
              >
                {navigating ? 'Stop and switch campus' : 'Open campus'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
