import { useEffect, useRef, useState } from 'react';
import type { ModelMeshState } from './useModelMesh';
import type { ModelDocument } from './model-document';
import { buildingPhotos } from './arrival';
import { modelPhotoImage } from './model-photo-image';
import { projectModelTexture } from './model-texture-projection';

type Crop = { photoId: string; corners: [number, number][] };
const initialCorners = (): [number, number][] => [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export function MeshTextureTools({ state }: { state: ModelMeshState }) {
  const {
    edit,
    data,
    object,
    selection,
    document,
    workspace,
    onPreview,
    commit,
    disabled,
  } = state;
  const photos = buildingPhotos(data, edit.id);
  const [crop, setCrop] = useState<Crop>({
    photoId: photos[0]?.id || '',
    corners: initialCorners(),
  });
  const [candidate, setCandidate] = useState<ModelDocument | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null),
    ownsPreview = useRef(false);
  const dragging = useRef<number | null>(null);
  const key = `mesh-texture:${object?.id || ''}`,
    photo = photos.find((p) => p.id === crop.photoId);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const recovered = workspace?.modelInputs[edit.id]?.[key],
    firstPhoto = photos[0]?.id || '';
  useEffect(() => {
    const saved = recovered;
    if (saved)
      try {
        const value = JSON.parse(saved) as Crop;
        if (
          typeof value.photoId === 'string' &&
          Array.isArray(value.corners) &&
          value.corners.length === 4 &&
          value.corners.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
          )
        )
          setCrop(value);
        else setError('The retained crop could not be restored.');
      } catch {
        setError('The retained crop could not be restored.');
      }
    else setCrop({ photoId: firstPhoto, corners: initialCorners() });
  }, [key, recovered, firstPhoto]);
  useEffect(() => {
    return () => {
      controller.current?.abort();
      if (ownsPreview.current) preview.current(null);
    };
  }, []);
  useEffect(() => {
    setCandidate(null);
    controller.current?.abort();
    if (ownsPreview.current) {
      preview.current(null);
      ownsPreview.current = false;
    }
  }, [selection, document]);
  const change = (next: Crop) => {
    controller.current?.abort();
    setCrop(next);
    setCandidate(null);
    if (ownsPreview.current) {
      onPreview(null);
      ownsPreview.current = false;
    }
    workspace?.recoverModelInput(edit.id, key, JSON.stringify(next));
  };
  const cancel = () => {
    controller.current?.abort();
    setCandidate(null);
    setBusy(false);
    setError('');
    if (ownsPreview.current) onPreview(null);
    ownsPreview.current = false;
    workspace?.recoverModelInput(edit.id, key);
  };
  const makePreview = async () => {
    if (!photo || !selection) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setBusy(true);
    setError('');
    try {
      const image = await modelPhotoImage(photo, crop.corners, request.signal);
      const next = projectModelTexture(document, selection, image);
      request.signal.throwIfAborted();
      setCandidate(next);
      ownsPreview.current = true;
      onPreview(next);
    } catch (e) {
      if (!request.signal.aborted) setError((e as Error).message);
    } finally {
      if (controller.current === request) setBusy(false);
    }
  };
  if (!object || !photos.length) return null;
  return (
    <fieldset disabled={disabled || object.locked}>
      <legend>Photograph on selected faces</legend>
      <p>
        Select coplanar mesh faces, align the crop, then preview the result.
      </p>
      <label>
        Reference photograph
        <select
          value={crop.photoId}
          onChange={(e) =>
            change({ photoId: e.target.value, corners: initialCorners() })
          }
        >
          {photos.map((p) => (
            <option value={p.id} key={p.id}>
              {p.caption || p.id}
            </option>
          ))}
        </select>
      </label>
      {photo && (
        <svg
          viewBox={`0 0 400 ${(400 * photo.height) / photo.width}`}
          aria-label="Photograph and selected crop"
          style={{ width: '100%', maxHeight: 240, touchAction: 'none' }}
          onPointerMove={(e) => {
            if (dragging.current === null || disabled || object.locked) return;
            const matrix = e.currentTarget.getScreenCTM();
            if (!matrix) return;
            const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
              matrix.inverse(),
            );
            change({
              ...crop,
              corners: crop.corners.map((p, i) =>
                i === dragging.current
                  ? [
                      Math.max(0, Math.min(1, point.x / 400)),
                      Math.max(
                        0,
                        Math.min(
                          1,
                          point.y / ((400 * photo.height) / photo.width),
                        ),
                      ),
                    ]
                  : p,
              ),
            });
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
          onLostPointerCapture={() => {
            dragging.current = null;
          }}
        >
          <image
            href={photo.url}
            width="400"
            height={(400 * photo.height) / photo.width}
            preserveAspectRatio="none"
          />
          <polygon
            points={crop.corners
              .map(
                ([x, y]) =>
                  `${x * 400},${(y * 400 * photo.height) / photo.width}`,
              )
              .join(' ')}
            fill="none"
            stroke="#ffb000"
            strokeWidth="2"
          />
          {crop.corners.map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x * 400}
                cy={(y * 400 * photo.height) / photo.width}
                r="7"
                fill="#ffb000"
                stroke="#222"
                onPointerDown={(e) => {
                  if (disabled || object.locked) return;
                  dragging.current = i;
                  e.currentTarget.ownerSVGElement?.setPointerCapture(
                    e.pointerId,
                  );
                  e.preventDefault();
                }}
              />
              <text
                x={x * 390 + 5}
                y={y * ((400 * photo.height) / photo.width - 20) + 15}
                fill="#ffb000"
                fontSize="16"
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      )}
      {crop.corners.map((point, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          {(['X', 'Y'] as const).map((axis, j) => (
            <label key={axis}>
              {['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]}{' '}
              {axis}
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={point[j]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  change({
                    ...crop,
                    corners: crop.corners.map((p, k) =>
                      k === i
                        ? (p.map((v, a) =>
                            a === j ? Math.min(1, Math.max(0, n)) : v,
                          ) as [number, number])
                        : p,
                    ),
                  });
                }}
              />
            </label>
          ))}
        </div>
      ))}
      <div className="model-toolbar">
        <button
          disabled={busy || !photo || !selection}
          onClick={() => void makePreview()}
        >
          {busy ? 'Preparing preview…' : 'Preview texture'}
        </button>
        <button
          disabled={!candidate || busy}
          onClick={() => {
            if (candidate && commit(candidate)) cancel();
          }}
        >
          Apply texture
        </button>
        <button onClick={cancel}>Cancel texture</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
