import { useId, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { Appearance } from './appearance';

export function AppearanceSettings({
  preference,
  dark,
  onChange,
}: {
  preference: Appearance;
  dark: boolean;
  onChange: (value: Appearance) => Promise<boolean>;
}) {
  const id = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <fieldset className="appearance-settings" aria-describedby={`${id}-help`}>
      <legend>Appearance</legend>
      <div className="appearance-options">
        {(
          [
            ['system', 'Device', Monitor],
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
          ] as const
        ).map(([value, label, Icon]) => (
          <label key={value}>
            <input
              type="radio"
              name={`${id}-appearance`}
              value={value}
              checked={preference === value}
              onChange={() => {
                void onChange(value).then((saved) => setSaveFailed(!saved));
              }}
            />
            <span>
              <Icon size={19} aria-hidden="true" />
              {label}
            </span>
          </label>
        ))}
      </div>
      <p id={`${id}-help`}>
        {preference === 'system'
          ? `Follows your device automatically. Currently using ${dark ? 'dark' : 'light'} mode.`
          : `Always uses ${preference} mode. Choose Device to follow your device settings.`}
      </p>
      {saveFailed && (
        <output>
          Appearance changed for this visit. Your browser could not save the
          choice.
        </output>
      )}
    </fieldset>
  );
}
