import { useEffect, useMemo, useState } from 'react';
import type { CampusData } from './types';
import { layerFeatures, layerMembership } from './campus-layers';
import { useEditorSession } from './EditorSession';
import { DockResize } from './EditorChrome';
import { featureReference } from './editor-session';
export default function ReadOnlyLayerTable({
  data,
  onInspect,
}: {
  data: CampusData;
  onInspect: (title: string, properties: Record<string, unknown>) => void;
}) {
  const session = useEditorSession(),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [session.state.table.id]);
  const features = useMemo(() => layerFeatures(data), [data]),
    membership = useMemo(() => layerMembership(data), [data]);
  const rows = features.filter(
    (f) =>
      (!session.state.table.id ||
        membership.get(f.key) === session.state.table.id) &&
      String(f.properties.name || f.id)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (!session.state.table.open || session.state.table.kind !== 'layer')
    return null;
  return (
    <section
      className="editor-card editor-table-dock"
      aria-label="Attribute table"
    >
      <DockResize axis="vertical" dimension="table" />
      <header>
        <h2>Attribute table · read only</h2>
        <button
          onClick={() =>
            session.setState((s) => ({
              ...s,
              table: { ...s.table, open: false },
              panel: 'catalogue',
            }))
          }
        >
          Close table
        </button>
      </header>
      <input
        aria-label="Search layer features"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffset(0);
        }}
      />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Feature</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(offset, offset + 100).map((f) => (
            <tr key={f.key}>
              <td>
                <button
                  onClick={() => {
                    onInspect(String(f.properties.name || f.id), f.properties);
                    session.setState((s) => ({
                      ...s,
                      selection: [
                        featureReference(session.capabilities.campusId, f.key),
                      ],
                      panel: 'inspector',
                    }));
                  }}
                >
                  {String(f.properties.name || 'Unnamed')}
                </button>
              </td>
              <td>{f.id}</td>
              <td>{f.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {rows.length} matching · {rows.length ? offset + 1 : 0}–
        {Math.min(offset + 100, rows.length)}
      </p>
      <button
        disabled={!offset}
        onClick={() => setOffset((n) => Math.max(0, n - 100))}
      >
        Previous
      </button>
      <button
        disabled={offset + 100 >= rows.length}
        onClick={() => setOffset((n) => n + 100)}
      >
        Next
      </button>
    </section>
  );
}
