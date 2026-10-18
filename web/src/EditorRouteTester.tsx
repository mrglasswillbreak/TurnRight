import { Route as RouteIcon, X } from 'lucide-react';
import { WorkspacePane } from './WorkspaceFrame';
import { meters } from './geo';
import { placeHasConnection } from './routing';

import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorTasksBindings } from './useEditorTasks';

type Props = Pick<
  EditorSessionStateBindings,
  | 'tab'
  | 'layersOpen'
  | 'busy'
  | 'testOrigin'
  | 'setTestOrigin'
  | 'testDest'
  | 'setTestDest'
  | 'routes'
  | 'setRoutes'
  | 'showRoutes'
  | 'setShowRoutes'
  | 'validation'
> &
  Pick<EditorTasksBindings, 'previewTestRoute'>;
export function EditorRouteTester(props: Props) {
  const {
    tab,
    layersOpen,
    busy,
    testOrigin,
    setTestOrigin,
    testDest,
    setTestDest,
    routes,
    setRoutes,
    showRoutes,
    setShowRoutes,
    validation,
    previewTestRoute,
  } = props;
  return (
    showRoutes &&
    tab === 'map' &&
    !layersOpen && (
      <WorkspacePane id="right" title="Route test">
        <section className="editor-route-test editor-card">
          <div className="editor-panel-heading">
            <h2>Test a walking route</h2>
            <button
              className="editor-icon"
              aria-label="Close route test"
              onClick={() => {
                setShowRoutes(false);
                setRoutes([]);
              }}
            >
              <X size={16} />
            </button>
          </div>
          {[
            [testOrigin, setTestOrigin, 'From'],
            [testDest, setTestDest, 'To'],
          ].map(([value, set, label]) => (
            <label className="field-label" key={String(label)}>
              {String(label)}
              <select
                aria-label={`Test route ${label}`}
                value={value as string}
                onChange={(e) => (set as (s: string) => void)(e.target.value)}
              >
                <option value="">Choose a place</option>
                {validation.data.places
                  .filter((p) => placeHasConnection(validation.data, p))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <button
            className="editor-primary"
            disabled={!testOrigin || !testDest || busy || validation.pending}
            onClick={previewTestRoute}
          >
            <RouteIcon size={16} /> Preview route
          </button>
          {routes.map((route, i) => (
            <p key={route.id}>
              {i ? 'Alternative' : 'Shortest walk'} · {meters(route.distance)}
              {route.destinationEntranceId && (
                <small>
                  {' '}
                  Arrive at{' '}
                  {
                    validation.data.entrances?.find(
                      (e) => e.id === route.destinationEntranceId,
                    )?.name
                  }
                </small>
              )}
            </p>
          ))}
        </section>
      </WorkspacePane>
    )
  );
}
