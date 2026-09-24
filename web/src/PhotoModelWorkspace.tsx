import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { CampusData, MapEdit } from './types';
import type {
  BuildingSelection,
  FacadeDescription,
  FacadeElement,
  FacadeElementKind,
} from './visual-types';
import { facadeErrors, facadeMatches, facadeWalls } from './building-facades';
import { PhotoModelPreview } from './PhotoModelPreview';
import './photo-model.css';

export default function PhotoModelWorkspace({
  edit,
  data,
  selection,
  onSelection,
  onEdit,
  onClose,
}: {
  edit: MapEdit;
  data: CampusData;
  selection?: BuildingSelection;
  onSelection: (s: BuildingSelection) => void;
  onEdit: (e: MapEdit) => void;
  onClose: () => void;
}) {
  const draggingCorner = useRef<number | null>(null);
  const initial = useRef(edit);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => returnFocus.current?.focus(), []);
  const [draft, setDraft] = useState(edit),
    [wallId, setWallId] = useState(selection?.wallId || ''),
    [before, setBefore] = useState(false),
    [tab, setTab] = useState('photo'),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const feature = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: draft.geometry,
      properties: { ...draft.properties, id: draft.id },
    }),
    [draft],
  );
  const original = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: initial.current.geometry,
      properties: { ...initial.current.properties, id: initial.current.id },
    }),
    [],
  );
  const walls = useMemo(() => facadeWalls(feature), [feature]);
  const photos = useMemo(
    () => (data.photos || []).filter((p) => p.buildingId === edit.id),
    [data.photos, edit.id],
  );
  const [photoId, setPhotoId] = useState(photos[0]?.id || '');
  useEffect(() => {
    // Draft validation may finish after the lazy workspace opens.
    if (!photoId && photos.length) setPhotoId(photos[0].id);
  }, [photos, photoId]);
  const wall = walls.find((w) => w.wallId === wallId),
    photo = photos.find((p) => p.id === photoId);
  const facade: FacadeDescription | undefined =
    draft.properties.appearance?.facades?.[wallId];
  const base = (): FacadeDescription =>
    facade || {
      partId: wall!.partId,
      wallId,
      wallCoordinates: wall!.coordinates,
      photoIds: photoId ? [photoId] : [],
      notes: '',
      confidence: 'observed',
      elements: [],
    };
  const change = (update: Partial<FacadeDescription>) => {
    if (!wall) return;
    const value = { ...base(), ...update, reviewedAt: undefined };
    setSaved(false);
    setDraft((d) => ({
      ...d,
      properties: {
        ...d.properties,
        appearance: {
          ...d.properties.appearance,
          facades: { ...d.properties.appearance?.facades, [wallId]: value },
        },
      },
    }));
  };
  const element = (id: string, changes: Partial<FacadeElement>) =>
    change({
      elements: base().elements.map((e) =>
        e.id === id ? { ...e, ...changes } : e,
      ),
    });
  const add = (kind: FacadeElementKind) =>
    change({
      elements: [
        ...base().elements,
        {
          id: crypto.randomUUID(),
          kind,
          x: 0.5,
          bottom: kind === 'window' ? 1 : 0,
          width: kind === 'column' ? 0.35 : 1.5,
          height: kind === 'canopy' || kind === 'trim' ? 0.2 : 2,
          depth: kind === 'balcony' || kind === 'canopy' ? 1 : 0.08,
          count: 1,
          spacing: 0.1,
          colour: kind === 'window' ? '#557585' : '#d8cbb1',
        },
      ],
    });
  function save() {
    const next = structuredClone(draft);
    const errors = facadeErrors(feature, data.photos);
    if (errors.length) {
      setError(errors.join(' '));
      requestAnimationFrame(() => errorElement.current?.focus());
      return;
    }
    for (const f of Object.values(
      next.properties.appearance?.facades || {},
    ) as FacadeDescription[]) {
      if (f.needsReview || !facadeMatches(f, feature)) {
        setError('Confirm or rematch the changed wall before saving.');
        requestAnimationFrame(() => errorElement.current?.focus());
        return;
      }
      f.reviewedAt = new Date().toISOString();
    }
    onEdit(next);
    setSaved(true);
    setError('');
  }
  const visual = data.visuals?.buildings.find((v) => v.id === edit.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="photo-model-workspace"
        overlayClassName="photo-model-overlay"
      >
        <header>
          <DialogTitle>
            Photo &amp; model · {String(edit.properties.name || 'Building')}
          </DialogTitle>
          <DialogDescription>
            Match only details visible in the photograph. Dimensions remain
            estimates unless measured.
          </DialogDescription>
          <output aria-live="polite">
            {saved
              ? 'Saved to map draft · publication requires release review'
              : 'Unsaved model changes · Apply saves one undoable draft edit'}
          </output>
        </header>
        <div className="photo-model-mobile-tabs">
          {['photo', 'model'].map((t) => (
            <button
              type="button"
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'photo' ? 'Photograph' : 'Model'}
            </button>
          ))}
        </div>
        <div className={`photo-model-comparison show-${tab}`}>
          <section className="photo-model-reference">
            <label>
              Reference photograph
              <select
                value={photoId}
                onChange={(e) => setPhotoId(e.target.value)}
              >
                {photos.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.caption}
                  </option>
                ))}
              </select>
            </label>
            {photo ? (
              <>
                <div
                  className="photo-model-image"
                  style={{
                    aspectRatio: `${photo.width} / ${photo.height}`,
                    width: `min(100%, ${(38 * photo.width) / photo.height}dvh)`,
                  }}
                >
                  <img src={photo.url} alt={photo.alt} decoding="async" />
                  {facade?.texture?.photoId === photo.id && (
                    <svg
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      aria-label="Selected texture quadrilateral"
                      onPointerMove={(event) => {
                        const index = draggingCorner.current;
                        if (index === null || !facade.texture) return;
                        const box = event.currentTarget.getBoundingClientRect();
                        const point: [number, number] = [
                          Math.max(
                            0,
                            Math.min(1, (event.clientX - box.left) / box.width),
                          ),
                          Math.max(
                            0,
                            Math.min(1, (event.clientY - box.top) / box.height),
                          ),
                        ];
                        change({
                          texture: {
                            ...facade.texture,
                            corners: facade.texture.corners.map((p, i) =>
                              i === index ? point : p,
                            ),
                          },
                        });
                      }}
                      onPointerUp={() => {
                        draggingCorner.current = null;
                      }}
                      onPointerCancel={() => {
                        draggingCorner.current = null;
                      }}
                    >
                      <polygon
                        points={facade.texture.corners
                          .map((p) => p.join(','))
                          .join(' ')}
                        fill="#1764ed20"
                        stroke="#1764ed"
                        strokeWidth=".004"
                      />
                      {facade.texture.corners.map((p, i) => (
                        <g
                          key={i}
                          onPointerDown={(event) => {
                            draggingCorner.current = i;
                            event.currentTarget.parentElement?.setPointerCapture(
                              event.pointerId,
                            );
                            event.preventDefault();
                          }}
                        >
                          <circle
                            cx={p[0]}
                            cy={p[1]}
                            r=".065"
                            fill="transparent"
                          />
                          <circle
                            cx={p[0]}
                            cy={p[1]}
                            r=".015"
                            fill="#1764ed"
                            stroke="#fff"
                            strokeWidth=".005"
                            pointerEvents="none"
                          />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
                <p>
                  {photo.caption}
                  {photo.historical ? ' · Historical view' : ''}
                </p>
                <small>{photo.attribution}</small>
              </>
            ) : (
              <p>Add a reviewed building photograph in Manage photos first.</p>
            )}
          </section>
          <section className="photo-model-result">
            <button
              type="button"
              aria-pressed={before}
              onClick={() => setBefore((b) => !b)}
            >
              {before
                ? 'Showing before · show changes'
                : 'Showing changes · show before'}
            </button>
            <PhotoModelPreview
              feature={before ? original : feature}
              visual={visual}
              data={data}
              wallId={wallId}
            />
          </section>
        </div>
        <div className="photo-model-controls">
          <label>
            Mapped wall
            <select
              value={wallId}
              onChange={(e) => {
                setWallId(e.target.value);
                const w = walls.find((w) => w.wallId === e.target.value);
                if (w)
                  onSelection({
                    buildingId: edit.id,
                    partId: w.partId,
                    wallId: w.wallId,
                  });
              }}
            >
              <option value="">Choose a wall to match</option>
              {walls.map((w) => (
                <option key={w.wallId} value={w.wallId}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          {wall && (
            <>
              <p>
                Left to right follows the mapped wall’s original endpoints.
                Check the highlighted model wall before applying details.
              </p>
              <button
                type="button"
                disabled={!photo}
                onClick={() =>
                  change({
                    photoIds: [...new Set([...base().photoIds, photoId])],
                  })
                }
              >
                Use this photograph as wall evidence
              </button>
              {facade?.photoIds.map((id) => (
                <p key={id}>
                  {photos.find((p) => p.id === id)?.caption ||
                    'Unavailable source photograph'}{' '}
                  <button
                    type="button"
                    onClick={() =>
                      change({
                        photoIds: facade.photoIds.filter((p) => p !== id),
                        ...(facade.texture?.photoId === id
                          ? { texture: undefined }
                          : {}),
                      })
                    }
                  >
                    Remove evidence reference
                  </button>
                </p>
              ))}
              {(facade?.needsReview ||
                (facade && !facadeMatches(facade, feature))) && (
                <button
                  type="button"
                  onClick={() =>
                    change({
                      wallCoordinates: wall.coordinates,
                      needsReview: false,
                    })
                  }
                >
                  Confirm this wall still matches the reference
                </button>
              )}
              <label>
                Evidence and estimated dimensions
                <textarea
                  value={facade?.notes || ''}
                  maxLength={2000}
                  onChange={(e) => change({ notes: e.target.value })}
                />
              </label>
              <label>
                Confidence
                <select
                  value={facade?.confidence || 'observed'}
                  onChange={(e) =>
                    change({
                      confidence: e.target
                        .value as FacadeDescription['confidence'],
                    })
                  }
                >
                  <option value="observed">
                    Observed in photo · dimensions estimated
                  </option>
                  <option value="documented">Documented measurements</option>
                  <option value="inferred">Illustrative estimate</option>
                </select>
              </label>
              <div className="photo-model-add">
                {(
                  [
                    'window',
                    'door',
                    'column',
                    'balcony',
                    'canopy',
                    'parapet',
                    'trim',
                  ] as const
                ).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!photo}
                    onClick={() => add(k)}
                  >
                    Add {k}
                  </button>
                ))}
              </div>
              {facade?.elements.map((e) => (
                <fieldset key={e.id}>
                  <legend>{e.kind}</legend>
                  <div className="photo-model-fields">
                    {(
                      [
                        'x',
                        'bottom',
                        'width',
                        'height',
                        'depth',
                        'count',
                        'spacing',
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {
                          {
                            x: 'Position (0–1)',
                            bottom: 'Bottom (m)',
                            width: 'Width (m)',
                            height: 'Height (m)',
                            depth: 'Projection (m)',
                            count: 'Repeat count',
                            spacing: 'Spacing (wall fraction)',
                          }[key]
                        }
                        <input
                          type="number"
                          value={e[key]}
                          min={key === 'count' ? 1 : 0}
                          max={
                            key === 'count'
                              ? 40
                              : key === 'x' || key === 'spacing'
                                ? 1
                                : 150
                          }
                          step={key === 'count' ? 1 : 0.01}
                          onChange={(v) =>
                            element(e.id, { [key]: Number(v.target.value) })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Material colour
                      <input
                        type="color"
                        value={e.colour}
                        onChange={(v) =>
                          element(e.id, { colour: v.target.value })
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      change({
                        elements: facade.elements.filter((v) => v.id !== e.id),
                      })
                    }
                  >
                    Remove {e.kind}
                  </button>
                </fieldset>
              ))}
              <details>
                <summary>Photographic wall texture</summary>
                <p>
                  Use an unobstructed wall view. Choose four corners clockwise
                  from top left. A texture covers this wall; do not include sky,
                  people, vegetation, or unrelated surfaces.
                </p>
                <button
                  type="button"
                  disabled={!photo}
                  onClick={() =>
                    change({
                      photoIds: [...new Set([...base().photoIds, photoId])],
                      texture: {
                        photoId,
                        corners: [
                          [0.1, 0.1],
                          [0.9, 0.1],
                          [0.9, 0.9],
                          [0.1, 0.9],
                        ],
                      },
                    })
                  }
                >
                  Start texture alignment from this photo
                </button>
                {facade?.texture && (
                  <>
                    <div className="photo-model-fields">
                      {facade.texture.corners.map((p, i) => (
                        <fieldset key={i}>
                          <legend>
                            {
                              [
                                'Top left',
                                'Top right',
                                'Bottom right',
                                'Bottom left',
                              ][i]
                            }
                          </legend>
                          {([0, 1] as const).map((axis) => (
                            <label key={axis}>
                              {axis ? 'Y' : 'X'} fraction
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.001}
                                value={p[axis]}
                                onChange={(e) =>
                                  change({
                                    texture: {
                                      ...facade.texture!,
                                      corners: facade.texture!.corners.map(
                                        (v, j) =>
                                          j === i
                                            ? (v.map((n, k) =>
                                                k === axis
                                                  ? Number(e.target.value)
                                                  : n,
                                              ) as [number, number])
                                            : v,
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => change({ texture: undefined })}
                    >
                      Remove texture
                    </button>
                  </>
                )}
              </details>
              <button
                type="button"
                onClick={() => {
                  const facades = { ...draft.properties.appearance?.facades };
                  delete facades[wallId];
                  setDraft((d) => ({
                    ...d,
                    properties: {
                      ...d.properties,
                      appearance: { ...d.properties.appearance, facades },
                    },
                  }));
                  setSaved(false);
                }}
              >
                Reset this wall’s photo details
              </button>
            </>
          )}
          {Object.entries(draft.properties.appearance?.facades || {})
            .filter(([id]) => !walls.some((w) => w.wallId === id))
            .map(([id]) => (
              <p key={id}>
                Removed wall: its photographic evidence is retained.{' '}
                <button
                  type="button"
                  disabled={!wall}
                  onClick={() => {
                    const facades = { ...draft.properties.appearance!.facades };
                    const old = facades[id];
                    delete facades[id];
                    facades[wallId] = {
                      ...old,
                      partId: wall!.partId,
                      wallId,
                      wallCoordinates: wall!.coordinates,
                      needsReview: false,
                      reviewedAt: undefined,
                    };
                    setDraft((d) => ({
                      ...d,
                      properties: {
                        ...d.properties,
                        appearance: { ...d.properties.appearance, facades },
                      },
                    }));
                    setSaved(false);
                  }}
                >
                  Rematch to selected wall
                </button>
              </p>
            ))}
        </div>
        <footer>
          {error && (
            <p ref={errorElement} role="alert" tabIndex={-1}>
              {error}
            </p>
          )}
          <button type="button" onClick={save}>
            Apply reviewed model details
          </button>
          <button type="button" onClick={onClose}>
            {saved ? 'Close' : 'Close without applying'}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
