import { searchKey } from './place-details';
import { Route, Unlink } from 'lucide-react';
import type { EditorInspectorState } from './useEditorInspector';

export function InspectorEntranceProperties({
  state: viewState,
}: {
  state: EditorInspectorState;
}) {
  const {
    edit,
    search,
    setSearch,
    p,
    onProperty,
    data,
    onApproach,
    onPick,
    onDisconnect,
  } = viewState;

  return (
    <>
      {edit.kind === 'entrance' && (
        <>
          <label className="field-label">
            Serves this place
            <input
              aria-label="Search entrance place"
              type="search"
              placeholder="Search campus places…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Entrance place"
              data-editor-field="placeId"
              value={String(p.placeId || '')}
              onChange={(e) => onProperty('placeId', e.target.value)}
            >
              <option value="">Choose a place</option>
              {data.places
                .filter(
                  (place) =>
                    place.id === p.placeId ||
                    searchKey(place.name).includes(searchKey(search)),
                )
                .map((place) => (
                  <option value={place.id} key={place.id}>
                    {place.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="editor-primary" onClick={onApproach}>
            <Route size={16} /> Draw connecting path
          </button>
          <button
            className="editor-secondary"
            onClick={() => onPick('entrance-link')}
          >
            Connect at an existing path
          </button>
          {p.connection || p.connectTo ? (
            <button className="editor-text" onClick={() => onDisconnect()}>
              <Unlink size={14} /> Disconnect entrance
            </button>
          ) : (
            <p className="small-note">
              Draw an approach from this entrance to the walking network.
            </p>
          )}
        </>
      )}
    </>
  );
}
