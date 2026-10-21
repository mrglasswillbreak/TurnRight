import { useEffect, useRef, useState } from 'react';
import { buildingRevision } from './building-visuals';
import { detailRevision } from './building-facades';
import { ModelButton } from './ModelButton';
import { Focus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { type PhotoPreviewProps } from './photo-preview-types.js';
import { usePhotoModelScene } from './usePhotoModelScene.js';
export function PhotoModelPreview(props: PhotoPreviewProps) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef(props);
  current.current = props;
  const request = useRef<() => void>(() => {}),
    action = useRef<(a: string) => void>(() => {});
  const syncSurface = useRef<() => void>(() => {});
  const syncSelection = useRef<() => void>(() => {});
  const retry = useRef<() => void>(() => {});
  const resume = useRef<() => void>(() => {});
  const cancelGesture = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Building preview…');
  const signature = JSON.stringify([
    buildingRevision(props.feature),
    detailRevision(props.feature),
    props.visual,
  ]);
  usePhotoModelScene({
    host,
    current,
    request,
    action,
    syncSurface,
    syncSelection,
    retry,
    resume,
    cancelGesture,
    setFailed,
    setMessage,
  });
  useEffect(() => {
    cancelGesture.current();
    request.current();
  }, [signature]);
  const surfaceKey = JSON.stringify([props.surface, props.surfaceEditing]);
  useEffect(() => syncSurface.current(), [surfaceKey]);
  const selectionKey = JSON.stringify([
    props.selection,
    props.wallId,
    props.hidden,
  ]);
  useEffect(() => syncSelection.current(), [selectionKey]);
  useEffect(() => {
    if (props.active !== false) resume.current();
    else cancelGesture.current();
  }, [props.active]);
  return (
    <section className="photo-model-preview">
      <div ref={host} className="photo-model-canvas" />
      <output aria-live="polite">{message}</output>
      {failed && (
        <button onClick={() => retry.current()}>Retry model preview</button>
      )}
      {!props.surfaceEditing && (
        <div className="photo-model-view-buttons">
          <ModelButton icon={<Focus />} onClick={() => action.current('fit')}>
            Fit selection
          </ModelButton>
          <ModelButton
            icon={<RotateCcw />}
            onClick={() => action.current('reset')}
          >
            Reset view
          </ModelButton>
          {(
            [
              ['left', RotateCcw],
              ['right', RotateCw],
              ['in', ZoomIn],
              ['out', ZoomOut],
            ] as const
          ).map(([a, Icon]) => (
            <ModelButton
              key={a}
              icon={<Icon />}
              title={`${a === 'in' || a === 'out' ? 'Zoom' : 'Rotate'} ${a}`}
              aria-label={`${a === 'in' || a === 'out' ? 'Zoom' : 'Rotate'} ${a}`}
              onClick={() => action.current(a)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
export { type PhotoPreviewProps } from './photo-preview-types.js';
