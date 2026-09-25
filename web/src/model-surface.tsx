import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import type { FacadeElement, RoofDraft } from './visual-types';
import type { MapEdit } from './types';

export type SurfacePoint = [number, number, number];
export type SurfaceFrame = {
  key: string;
  kind: 'wall' | 'roof' | 'footprint';
  /** Three samples map the existing editor's SVG coordinates to geographic space. */
  origin: SurfacePoint;
  x: SurfacePoint;
  y: SurfacePoint;
  screen: { a: number; d: number; e: number; f: number };
};
export type SurfacePreview =
  | { wallId: string; elements: FacadeElement[] }
  | { edit: MapEdit }
  | { roof: RoofDraft }
  | null;
export const ModelSurfaceContext = createContext({
  active: false,
  revision: '',
  onFrame: (_frame: SurfaceFrame | null) => {},
  onPreview: (_preview: SurfacePreview) => {},
});

/** One editing controller drives both the precision SVG and its aligned 3D overlay.
 * The camera consumes the same screen transform that the gestures invert. */
export function useModelSurface(
  ref: RefObject<SVGSVGElement | null>,
  key: string,
  kind: SurfaceFrame['kind'],
  point: (x: number, y: number) => SurfacePoint,
  revision: string,
  cancel: () => void,
  preview: SurfacePreview = null,
) {
  const {
    active,
    revision: surfaceRevision,
    onFrame,
    onPreview,
  } = useContext(ModelSurfaceContext);
  const current = useRef({ point, cancel, preview });
  current.current = { point, cancel, preview };
  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const svg = ref.current;
    let frame = 0;
    const measure = () => {
      const matrix = svg.getScreenCTM();
      if (!matrix || !svg.clientWidth || !svg.clientHeight) return;
      onFrame({
        key,
        kind,
        origin: current.current.point(0, 0),
        x: current.current.point(1, 0),
        y: current.current.point(0, 1),
        screen: { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f },
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(svg);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
      onFrame(null);
    };
  }, [active, surfaceRevision, onFrame, key, kind, revision, ref]);
  useEffect(() => {
    current.current.cancel();
    const cancel = () => current.current.cancel();
    window.addEventListener('resize', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [active, surfaceRevision]);
  const previewKey = JSON.stringify(preview);
  useEffect(() => {
    if (active) onPreview(current.current.preview);
    return () => {
      if (active) onPreview(null);
    };
  }, [active, onPreview, previewKey]);
  return active;
}
