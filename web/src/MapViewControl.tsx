import { Layers } from 'lucide-react';
import './map-view-control.css';

export function MapViewControl({
  threeD,
  onView,
}: {
  threeD: boolean;
  onView: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`map-view-control ${threeD ? 'active' : ''}`}
      aria-label={threeD ? 'Switch to 2D' : 'Switch to 3D'}
      onClick={() => onView(!threeD)}
    >
      <Layers aria-hidden="true" />
      <span>{threeD ? '2D' : '3D'}</span>
    </button>
  );
}
