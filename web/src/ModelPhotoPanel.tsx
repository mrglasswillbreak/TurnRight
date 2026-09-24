/* SVG has no native button. Corner buttons support arrow keys and have equivalent labelled numeric fields. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */
import { useEffect, useRef, useState } from 'react';
import type { CampusPhoto } from './types';
import type { FacadeDescription, FacadeTextureRecipe } from './visual-types';
import type { EditorWorkspace } from './editor-workspace';
import { ModelField } from './ModelField';
export function ModelPhotoPanel({
  photos,
  photo,
  onPhoto,
  facade,
  workspace,
  buildingId,
  onCommit,
}: {
  photos: CampusPhoto[];
  photo?: CampusPhoto;
  onPhoto: (id: string) => void;
  facade?: FacadeDescription;
  workspace?: EditorWorkspace;
  buildingId: string;
  onCommit: (f: FacadeDescription) => boolean;
}) {
  const [zoom, setZoom] = useState(1),
    [recipe, setRecipe] = useState<FacadeTextureRecipe | null>(null),
    [error, setError] = useState('');
  const dragging = useRef<number | null>(null),
    image = useRef<HTMLDivElement>(null),
    latest = useRef<FacadeTextureRecipe | null>(null);
  const texture = recipe || facade?.texture;
  const recoveryWall = facade?.wallId;
  useEffect(() => {
    const saved =
      recoveryWall &&
      workspace?.modelInputs[buildingId]?.[`texture:${recoveryWall}`];
    if (saved)
      try {
        const restored = JSON.parse(saved) as FacadeTextureRecipe;
        if (restored.photoId === photo?.id) setRecipe(restored);
      } catch {
        setError(
          'Unfinished texture alignment could not be restored. Discard unfinished input to clear it.',
        );
      }
    else setRecipe(null);
  }, [recoveryWall, workspace?.modelInputs, buildingId, photo?.id]);
  const apply = (next: FacadeTextureRecipe | undefined) => {
    if (!facade) return false;
    const ok = onCommit({
      ...facade,
      texture: next,
      photoIds: next
        ? [...new Set([...facade.photoIds, next.photoId])]
        : facade.photoIds,
    });
    if (ok) {
      setRecipe(null);
      setError('');
      workspace?.recoverModelInput(buildingId, `texture:${facade.wallId}`);
    } else {
      if (next)
        workspace?.recoverModelInput(
          buildingId,
          `texture:${facade.wallId}`,
          JSON.stringify(next),
        );
      setRecipe(next || null);
      setError('Check the four corners: use clockwise, non-crossing corners.');
    }
    return ok;
  };
  if (!photo)
    return (
      <p>
        No approved photograph for this building. Illustrative details remain
        available.
      </p>
    );
  return (
    <section aria-label="Building photograph reference">
      <label>
        Reference photograph
        <select
          value={photo.id}
          onChange={(e) => {
            setRecipe(null);
            onPhoto(e.target.value);
          }}
        >
          {photos.map((p, i) => (
            <option key={p.id} value={p.id}>
              {p.caption || `Photograph ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <div className="model-toolbar">
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
          Enlarge photo
        </button>
        <button onClick={() => setZoom(1)}>Fit photo</button>
      </div>
      <div className="model-photo-scroll">
        <div
          ref={image}
          className="photo-model-image"
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: `${photo.width}/${photo.height}`,
          }}
        >
          <img src={photo.url} alt={photo.alt} loading="lazy" />
          {texture?.photoId === photo.id && (
            <svg
              role="application"
              aria-label="Texture alignment. Select a corner or use its numeric coordinates below."
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && dragging.current !== null) {
                  e.preventDefault();
                  e.stopPropagation();
                  dragging.current = null;
                  latest.current = null;
                  setRecipe(null);
                }
              }}
              onPointerMove={(e) => {
                if (dragging.current === null || !image.current) return;
                const b = image.current.getBoundingClientRect(),
                  next = {
                    ...texture,
                    corners: texture.corners.map((p, i): [number, number] =>
                      i === dragging.current
                        ? [
                            Math.max(
                              0,
                              Math.min(1, (e.clientX - b.left) / b.width),
                            ),
                            Math.max(
                              0,
                              Math.min(1, (e.clientY - b.top) / b.height),
                            ),
                          ]
                        : p,
                    ),
                  };
                latest.current = next;
                setRecipe(next);
              }}
              onPointerUp={() => {
                dragging.current = null;
                if (latest.current) {
                  apply(latest.current);
                  latest.current = null;
                }
              }}
              onPointerCancel={() => {
                dragging.current = null;
                latest.current = null;
                setRecipe(null);
              }}
            >
              <polygon
                points={texture.corners.map((p) => p.join(',')).join(' ')}
                fill="#087cf0"
                fillOpacity={0.15}
                stroke="#087cf0"
                strokeWidth={0.005}
              />
              {texture.corners.map((p, i) => (
                <g key={i}>
                  <circle
                    tabIndex={0}
                    role="button"
                    aria-label={`${['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]} texture corner. Arrow keys adjust alignment.`}
                    cx={p[0]}
                    cy={p[1]}
                    r={0.025}
                    fill="#087cf0"
                    stroke="white"
                    strokeWidth={0.004}
                    onPointerDown={(e) => {
                      e.currentTarget.focus();
                      dragging.current = i;
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onKeyDown={(e) => {
                      if (
                        ![
                          'ArrowLeft',
                          'ArrowRight',
                          'ArrowUp',
                          'ArrowDown',
                        ].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      const axis =
                        e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 0 : 1;
                      const amount =
                        (e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                          ? -1
                          : 1) * (e.shiftKey ? 0.01 : 0.001);
                      apply({
                        ...texture,
                        corners: texture.corners.map((corner, j) =>
                          j === i
                            ? (corner.map((n, a) =>
                                a === axis
                                  ? Math.max(0, Math.min(1, n + amount))
                                  : n,
                              ) as [number, number])
                            : corner,
                        ),
                      });
                    }}
                  />
                  <text
                    x={p[0]}
                    y={p[1] + 0.009}
                    textAnchor="middle"
                    fontSize=".025"
                    fill="white"
                    pointerEvents="none"
                  >
                    {['TL', 'TR', 'BR', 'BL'][i]}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      <p>
        {photo.caption}
        {photo.historical ? ' · Historical view' : ''}
      </p>
      <small>{photo.attribution}</small>
      {facade && (
        <details>
          <summary>Photographic texture alignment</summary>
          <p>
            Choose an unobstructed wall clockwise from top left. This changes a
            derivative, never the gallery original.
          </p>
          <button
            onClick={() =>
              apply({
                photoId: photo.id,
                corners: [
                  [0.1, 0.1],
                  [0.9, 0.1],
                  [0.9, 0.9],
                  [0.1, 0.9],
                ],
              })
            }
          >
            Start / reset alignment
          </button>
          {texture?.photoId === photo.id && (
            <>
              {texture.corners.map((p, i) => (
                <div className="model-properties-grid" key={i}>
                  {([0, 1] as const).map((axis) => (
                    <ModelField
                      key={`${texture.photoId}:${i}:${axis}`}
                      label={`${['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]} ${axis ? 'Y' : 'X'}`}
                      value={p[axis]}
                      min={0}
                      max={1}
                      step={0.001}
                      buildingId={buildingId}
                      workspace={workspace}
                      field={`texture:${facade.wallId}:${i}:${axis}`}
                      onCommit={(v) =>
                        apply({
                          ...texture,
                          corners: texture.corners.map(
                            (p, j): [number, number] =>
                              i === j
                                ? (p.map((n, a) =>
                                    a === axis ? Number(v) : n,
                                  ) as [number, number])
                                : p,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              ))}
              <button onClick={() => apply(undefined)}>Remove texture</button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </section>
  );
}
