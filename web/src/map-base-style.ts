import type { StyleSpecification } from 'maplibre-gl';
import { campusPalette } from './map-palette';
export const style = (theme: boolean): StyleSpecification => ({
  version: 8,
  glyphs: '/glyphs/{fontstack}/{range}.pbf',
  light: {
    anchor: 'viewport',
    color: theme ? '#becfe0' : '#ffffff',
    intensity: theme ? 0.35 : 0.45,
    position: [1.5, 210, 40],
  },
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': campusPalette[theme ? 'dark' : 'light'].ground,
      },
    },
  ],
});
