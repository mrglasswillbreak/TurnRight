import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Map as MapInstance } from 'maplibre-gl';
import { MapRenderingSettings } from './MapRenderingSettings';
import { AppearanceSettings } from './AppearanceSettings';
import type { Appearance } from './appearance';

export function EditorSettings({
  appearance,
  dark,
  onAppearance,
  map,
  threeD,
  simple,
  onSimple,
  opacity,
  onOpacity,
  onClose,
}: {
  appearance: Appearance;
  dark: boolean;
  onAppearance: (value: Appearance) => Promise<boolean>;
  map: MapInstance | null;
  threeD: boolean;
  simple: boolean;
  onSimple: (value: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  onClose: () => void;
}) {
  const [pitch, setPitch] = useState(() => map?.getPitch() || 0);
  useEffect(() => {
    if (!map) return;
    const update = () => setPitch(map.getPitch());
    update();
    map.on('pitch', update);
    return () => {
      map.off('pitch', update);
    };
  }, [map]);
  return (
    <aside
      className="editor-review-panel editor-card editor-settings"
      aria-label="Editor settings"
    >
      <div className="editor-panel-heading">
        <h2>Settings</h2>
        <button
          className="editor-icon"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <AppearanceSettings
        preference={appearance}
        dark={dark}
        onChange={onAppearance}
      />
      <MapRenderingSettings simple={simple} onSimple={onSimple} />
      <label className="field-label">
        <span>
          Tilt{' '}
          <output>
            {threeD ? `${Math.round(pitch)}°` : '· Available in 3D'}
          </output>
        </span>
        <input
          type="range"
          aria-label="Map tilt"
          min={15}
          max={60}
          disabled={!threeD || !map}
          value={Math.max(15, pitch)}
          onChange={(event) => map?.setPitch(Number(event.target.value))}
        />
      </label>
      <label className="field-label">
        <span>
          Building opacity <output>{Math.round(opacity * 100)}%</output>
        </span>
        <input
          type="range"
          aria-label="Building opacity"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(event) => onOpacity(Number(event.target.value))}
        />
      </label>
    </aside>
  );
}
