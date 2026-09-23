import { PhotoSession } from '../../src/PhotoSession';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PhotoManager } from '../../src/PhotoManager';
import type { CampusData, MapEdit } from '../../src/types';
import '../../src/styles.css';
import '../../src/editor.css';

const data: CampusData = await (await fetch('/fixture-campus.json')).json();
const building = data.map.features.find(
  (f) => f.properties?.kind === 'building',
)!;
const edit: MapEdit = {
  id: String(building.properties!.id),
  kind: 'building',
  geometry: building.geometry,
  properties: building.properties!,
};
function Fixture() {
  const [selected, setSelected] = useState(edit);
  return (
    <PhotoSession owner="performance-owner">
      <label>
        Fixture building
        <select
          aria-label="Fixture building"
          onChange={(event) => {
            const b = data.map.features.find(
              (f) => f.properties?.id === event.target.value,
            )!;
            setSelected({
              id: String(b.properties!.id),
              kind: 'building',
              properties: b.properties!,
              geometry: b.geometry,
            });
          }}
        >
          {data.map.features
            .filter((f) => f.properties?.kind === 'building')
            .map((f) => (
              <option
                key={String(f.properties!.id)}
                value={String(f.properties!.id)}
              >
                {String(f.properties!.name || f.properties!.id)}
              </option>
            ))}
        </select>
      </label>
      <PhotoManager
        key={selected.id}
        edit={selected}
        data={data}
        owner="performance-owner"
        onApply={() => {}}
        onUndo={() => {}}
        saveStatus="Saved"
      />
    </PhotoSession>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
