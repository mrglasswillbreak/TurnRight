import { featureEdit } from './editor-features';
import { distance } from './geo';
import type { Position } from './types';
import { replacementTarget } from './survey-model';
import type { SurveySessionState } from './useSurveySession';

export function SurveyStart({ state }: { state: SurveySessionState }) {
  const {
    screen,
    attempt,
    start,
    setReselecting,
    setScreen,
    setMessage,
    saved,
    prepareOffline,
    query,
    setQuery,
    data,
    map,
    edits,
    setPath,
    setBoundaries,
    center,
    path,
    boundaries,
    reselecting,
    session,
    persist,
  } = state;
  return (
    <>
      {screen === 'home' && (
        <>
          <h2>Map it by walking</h2>
          <p>
            Keep TurnRight visible while recording. Review the path and
            connections before applying it.
          </p>
          <button
            className="survey-primary"
            onClick={() => void attempt(() => start())}
          >
            Record new path
          </button>
          <p>
            Starting requests optional compass and motion access. GPS recording
            works if you decline.
          </p>
          <button
            onClick={() => {
              setReselecting(false);
              setScreen('replace');
              setMessage(
                'Select a mapped path, then its two boundary vertices.',
              );
            }}
          >
            Correct existing path
          </button>
          <button onClick={() => void attempt(saved)}>Saved surveys</button>
          <button
            onClick={() =>
              void attempt(async () => {
                setMessage('Verifying owner and downloading the offline map…');
                await prepareOffline();
                setMessage(
                  'Ready for offline surveying on this device. Keep this owner signed in.',
                );
              })
            }
          >
            Prepare for offline survey
          </button>
        </>
      )}
      {screen === 'replace' && (
        <>
          <h2>Choose the section to replace</h2>
          <p>
            Select a path on the map or search below. Move the crosshair to each
            existing boundary vertex. Purple junctions stay fixed.
          </p>
          <input
            aria-label="Find existing path"
            placeholder="Find path"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="survey-choices">
            {data.map.features
              .filter(
                (f) =>
                  f.properties?.kind === 'path' &&
                  String(f.properties.name || 'Campus path')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .slice(0, 12)
              .map((f) => (
                <button
                  key={String(f.properties!.id)}
                  onClick={() => {
                    const p = featureEdit(
                      data,
                      'path',
                      String(f.properties!.id),
                      edits,
                    );
                    setPath(p || null);
                    setBoundaries([]);
                    if (p?.geometry.type === 'LineString')
                      map.easeTo({
                        center: p.geometry.coordinates[0] as Position,
                        zoom: 19,
                      });
                  }}
                >
                  {String(f.properties!.name || 'Campus path')}
                </button>
              ))}
          </div>
          <p>
            {String(path?.properties.name || 'No path selected')} ·{' '}
            {boundaries.length}/2 boundaries
          </p>
          <button
            onClick={() =>
              void attempt(async () => {
                if (path?.geometry.type !== 'LineString')
                  throw new Error('Select a path first.');
                const points = path.geometry.coordinates as Position[];
                const index = points
                  .map((p, i) => ({ i, d: distance(center, p) }))
                  .sort((a, b) => a.d - b.d)[0];
                if (index.d > 8)
                  throw new Error(
                    'Move the crosshair closer to a purple boundary vertex.',
                  );
                setBoundaries((b) => [...b.slice(-1), index.i]);
              })
            }
          >
            Set boundary here
          </button>
          <button
            className="survey-primary"
            disabled={boundaries.length !== 2}
            onClick={() =>
              void attempt(async () => {
                if (reselecting && session && path) {
                  session.replacement = replacementTarget(
                    path,
                    data,
                    ...([...boundaries].sort((a, b) => a - b) as [
                      number,
                      number,
                    ]),
                  );
                  delete session.appliedTarget;
                  await persist();
                  setScreen('survey');
                  setMessage(
                    'Replacement target updated. Review the fixed anchors before applying.',
                  );
                } else await start(true);
              })
            }
          >
            {reselecting
              ? 'Use reviewed replacement boundaries'
              : 'Record replacement'}
          </button>
          <button onClick={() => setScreen('home')}>Back</button>
        </>
      )}
    </>
  );
}
