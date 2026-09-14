import type { CampusData } from './types';
import { resolvePlaceId } from './map-display';
export function destinationLink(placeId: string, origin: string) {
  const url = new URL('/', origin);
  url.searchParams.set('place', placeId);
  return url.href;
}
export function sharedDestination(data: CampusData, url: string) {
  const requested = new URL(url).searchParams.get('place');
  if (!requested) return { requested: null, place: undefined };
  const id = resolvePlaceId(data, requested);
  return { requested, place: data.places.find((p) => p.id === id) };
}
