import type { Map as MapInstance } from 'maplibre-gl';
import { placeColours } from './map-sources';

// Small vector symbols drawn locally; no remote sprites or per-place DOM nodes.
const symbols: Record<keyof typeof placeColours, string> = {
  academic: 'M2 9L12 4L22 9L12 14Z M6 11V17Q12 21 18 17V11 M22 9V16',
  library: 'M3 5Q8 3 12 6Q16 3 21 5V19Q16 17 12 20Q8 17 3 19Z M12 6V20',
  food: 'M5 3V9Q5 12 8 12Q11 12 11 9V3 M8 3V21 M18 3Q14 7 15 13H19 M19 3V21',
  services: 'M4 8H20V20H4Z M9 8V4H15V8 M4 13H20 M10 13V15H14V13',
  residence: 'M3 11L12 3L21 11 M5 10V21H19V10 M10 21V14H14V21',
  worship: 'M4 21V11H20V21 M8 11V8Q8 4 12 3Q16 4 16 8V11 M10 21V16H14V21',
  sports:
    'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3 M3 12H21 M12 3Q4 12 12 21 M12 3Q20 12 12 21',
  gate: 'M4 21V4H20V21 M8 21V8H16V21 M2 21H6 M18 21H22',
  other:
    'M12 21Q4 14 4 9A8 8 0 0 1 20 9Q20 14 12 21Z M12 6A3 3 0 1 0 12 12A3 3 0 1 0 12 6',
};

export function installPlaceBadges(map: MapInstance) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  for (const [category, path] of Object.entries(symbols)) {
    const id = `place-${category}`;
    if (map.hasImage(id)) continue;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = placeColours[category as keyof typeof placeColours].dark;
    ctx.strokeStyle = '#213448';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(14, 14);
    ctx.scale(1.5, 1.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.8;
    ctx.stroke(new Path2D(path));
    ctx.restore();
    map.addImage(id, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
  }
  return true;
}
