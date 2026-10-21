import { featureEdit } from './editor-features';
import { distance } from './geo';
import { surveyId, reviewUndo } from './survey-model';
import type { SurveySessionState } from './useSurveySession';

export function SurveyReview({ state }: { state: SurveySessionState }) {
  const {
    session,
    changed,
    attempt,
    persist,
    resume,
    setReselecting,
    setPath,
    data,
    edits,
    setBoundaries,
    setScreen,
    command,
    center,
    setSelection,
    map,
    selectedLine,
    selectedMarker,
    vertexIndex,
    connect,
    setConnect,
    snap,
    reviewSnap,
    placeHere,
    editLine,
    cutStart,
    setCutStart,
    setMarker,
  } = state;
  if (!session) return null;
  return (
    <>
      {session.state === 'review' && (
        <>
          <input
            aria-label="Survey name"
            value={session.name}
            onChange={(e) => {
              session.name = e.target.value;
              changed();
            }}
            onBlur={() => void attempt(persist)}
          />
          <p>
            Grey is the recording; orange needs review; green is reviewed. Gaps
            remain disconnected. Tap a vertex or entrance to adjust it.
          </p>
          <div className="survey-actions">
            <button
              disabled={!session.past.length}
              onClick={() => {
                reviewUndo(session);
                void attempt(persist);
              }}
            >
              Undo survey edit
            </button>
            <button
              disabled={!session.future.length}
              onClick={() => {
                reviewUndo(session, true);
                void attempt(persist);
              }}
            >
              Redo survey edit
            </button>
            <button onClick={() => void attempt(resume)}>
              Rewalk missing section
            </button>
            {session.replacement && (
              <button
                onClick={() => {
                  setReselecting(true);
                  setPath(
                    featureEdit(
                      data,
                      'path',
                      session.replacement!.edit.id,
                      edits,
                    ) || null,
                  );
                  setBoundaries([]);
                  setScreen('replace');
                }}
              >
                Review replacement target
              </button>
            )}
            <button
              onClick={() => {
                command((s) =>
                  s.review.push({
                    id: surveyId(),
                    reviewed: false,
                    vertices: [{ id: surveyId(), coordinates: center }],
                  }),
                );
                setSelection({
                  line: session.review.at(-1)!.id,
                  vertex: 0,
                });
              }}
            >
              Draw connecting section
            </button>
          </div>
          <div className="survey-choices">
            {session.review.map((l, i) => (
              <button
                key={l.id}
                onClick={() => {
                  setSelection({ line: l.id, vertex: 0 });
                  map.easeTo({
                    center: l.vertices[0].coordinates,
                    zoom: 19,
                  });
                }}
              >
                Section {i + 1} · {l.reviewed ? 'Reviewed' : 'Needs review'}
              </button>
            ))}
          </div>
          {(selectedLine || selectedMarker) && (
            <fieldset>
              <legend>
                {selectedMarker
                  ? selectedMarker.name
                  : `Section vertex ${vertexIndex + 1}`}
              </legend>
              <label>
                <input
                  type="checkbox"
                  checked={connect}
                  onChange={(e) => setConnect(e.target.checked)}
                />{' '}
                Connect to highlighted target
              </label>
              {connect && (
                <p>
                  {snap?.label ||
                    (reviewSnap
                      ? 'Connect to survey vertex'
                      : 'Move crosshair onto a path or vertex')}
                </p>
              )}
              <button
                className="survey-primary"
                onClick={() => void attempt(async () => placeHere())}
              >
                Place here
              </button>
              {selectedLine && (
                <>
                  <label>
                    Observed street or path name
                    <input
                      aria-label="Observed street name"
                      value={selectedLine.name || ''}
                      onChange={(e) =>
                        editLine((l) => {
                          l.name = e.target.value;
                        })
                      }
                      placeholder="Leave blank when unknown"
                    />
                  </label>
                  <div className="survey-actions">
                    <button
                      onClick={() =>
                        setSelection({
                          line: selectedLine.id,
                          vertex: Math.max(0, vertexIndex - 1),
                        })
                      }
                    >
                      Previous vertex
                    </button>
                    <button
                      onClick={() =>
                        setSelection({
                          line: selectedLine.id,
                          vertex: Math.min(
                            selectedLine.vertices.length - 1,
                            vertexIndex + 1,
                          ),
                        })
                      }
                    >
                      Next vertex
                    </button>
                    <button
                      onClick={() => {
                        editLine((l) =>
                          l.vertices.splice(vertexIndex + 1, 0, {
                            id: surveyId(),
                            coordinates: center,
                          }),
                        );
                        setSelection({
                          line: selectedLine.id,
                          vertex: vertexIndex + 1,
                        });
                      }}
                    >
                      Insert vertex after
                    </button>
                    <button
                      onClick={() => {
                        editLine((l) => {
                          if (l.vertices[vertexIndex].pinned)
                            throw new Error(
                              'Keep this entrance or fixed junction anchor.',
                            );
                          if (l.vertices.length <= 2)
                            throw new Error('Remove the section instead.');
                          l.vertices.splice(vertexIndex, 1);
                        });
                        setSelection({
                          line: selectedLine.id,
                          vertex: Math.max(0, vertexIndex - 1),
                        });
                      }}
                    >
                      Delete vertex
                    </button>
                    <button
                      onClick={() => {
                        editLine((l) => {
                          if (
                            l.vertices
                              .slice(0, vertexIndex)
                              .some((v) => v.pinned)
                          )
                            throw new Error(
                              'Trim would remove a fixed anchor.',
                            );
                          l.vertices = l.vertices.slice(vertexIndex);
                        });
                        setSelection({
                          line: selectedLine.id,
                          vertex: 0,
                        });
                      }}
                    >
                      Trim before
                    </button>
                    <button
                      onClick={() =>
                        editLine((l) => {
                          if (
                            l.vertices
                              .slice(vertexIndex + 1)
                              .some((v) => v.pinned)
                          )
                            throw new Error(
                              'Trim would remove a fixed anchor.',
                            );
                          l.vertices = l.vertices.slice(0, vertexIndex + 1);
                        })
                      }
                    >
                      Trim after
                    </button>
                    <button
                      disabled={
                        vertexIndex === 0 ||
                        vertexIndex === selectedLine.vertices.length - 1
                      }
                      onClick={() =>
                        command((s) => {
                          const l = s.review.find(
                            (l) => l.id === selectedLine.id,
                          )!;
                          s.review.push({
                            id: surveyId(),
                            vertices: structuredClone(
                              l.vertices.slice(vertexIndex),
                            ),
                            reviewed: false,
                          });
                          l.vertices = l.vertices.slice(0, vertexIndex + 1);
                          l.reviewed = false;
                        })
                      }
                    >
                      Split here
                    </button>
                    <button
                      onClick={() => {
                        if (cutStart === null) {
                          setCutStart(vertexIndex);
                          return;
                        }
                        command((s) => {
                          const l = s.review.find(
                            (l) => l.id === selectedLine.id,
                          )!;
                          const [a, b] = [cutStart, vertexIndex].sort(
                            (a, b) => a - b,
                          );
                          if (a === b)
                            throw new Error(
                              'Choose the other end of the section to remove.',
                            );
                          if (l.vertices.slice(a + 1, b).some((v) => v.pinned))
                            throw new Error(
                              'Removal would lose a fixed anchor.',
                            );
                          const tail = l.vertices.slice(b);
                          l.vertices = l.vertices.slice(0, a + 1);
                          l.reviewed = false;
                          if (tail.length >= 2)
                            s.review.push({
                              id: surveyId(),
                              vertices: tail,
                              reviewed: false,
                            });
                        });
                        setCutStart(null);
                      }}
                    >
                      {cutStart === null
                        ? 'Start section removal'
                        : 'Remove to this vertex'}
                    </button>
                  </div>
                  {session.replacement?.anchors.map((anchor, i) => (
                    <button
                      key={anchor.id}
                      onClick={() =>
                        void attempt(async () => {
                          if (distance(center, anchor.coordinates) > 5)
                            throw new Error(
                              'Move the crosshair to this fixed anchor first.',
                            );
                          editLine((l) => {
                            l.vertices[vertexIndex] = {
                              ...l.vertices[vertexIndex],
                              ...anchor,
                            };
                          });
                        })
                      }
                    >
                      Use fixed anchor {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      command((s) => {
                        const l = s.review.find(
                          (l) => l.id === selectedLine.id,
                        )!;
                        if (l.vertices.length < 2)
                          throw new Error(
                            'A path needs at least two vertices.',
                          );
                        l.reviewed = true;
                      })
                    }
                  >
                    Confirm section reviewed
                  </button>
                  <button
                    onClick={() => {
                      command((s) => {
                        s.review = s.review.filter(
                          (l) => l.id !== selectedLine.id,
                        );
                      });
                      setSelection(null);
                    }}
                  >
                    Remove whole section
                  </button>
                </>
              )}
              {selectedMarker && (
                <>
                  <button
                    onClick={() => {
                      setMarker(structuredClone(selectedMarker));
                      map.easeTo({
                        center: selectedMarker.coordinates,
                        zoom: 20,
                        pitch: 0,
                      });
                    }}
                  >
                    Edit entrance details
                  </button>
                  <button
                    onClick={() => {
                      command((s) => {
                        s.markers = s.markers.filter(
                          (m) => m.id !== selectedMarker.id,
                        );
                        for (const l of s.review)
                          for (const v of l.vertices)
                            if (
                              v.sampleId === selectedMarker.sampleId &&
                              !s.markers.some((m) => m.sampleId === v.sampleId)
                            )
                              v.pinned = !!session.replacement?.anchors.some(
                                (a) => a.id === v.id,
                              );
                      });
                      setSelection(null);
                    }}
                  >
                    Delete entrance
                  </button>
                </>
              )}
            </fieldset>
          )}
        </>
      )}
    </>
  );
}
