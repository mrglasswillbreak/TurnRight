import { useEffect, useRef } from 'react';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { ModelPreviewScene } from './model-preview-scene';
import type { ModelMesh } from './visual-types';
import {
  add3,
  centre3,
  modelEdges,
  selectedVertices,
  transformPoint,
  type MeshSelection,
  type ModelDocument,
  type ModelObject,
  type Vec3,
} from './model-document';
import { meshCommand, faceNormal } from './model-mesh-commands';
import { surfaceLocal } from './model-surface-frame';
import { transformModelHierarchy } from './model-object-transform';

export interface MeshViewportOptions {
  scene: ModelPreviewScene | null;
  document: ModelDocument;
  selection: MeshSelection | null;
  kind: MeshSelection['kind'];
  tool: 'select' | 'move' | 'rotate' | 'scale';
  axis: 'free' | 'x' | 'y' | 'z';
  grid: number;
  multi: boolean;
  surface: boolean;
  disabled: boolean;
  onSelect: (selection: MeshSelection) => void;
  onPreview: (document: ModelDocument | null) => void;
  onCommit: (document: ModelDocument) => boolean;
  onError: (message: string) => void;
}
export function useMeshViewport(options: MeshViewportOptions) {
  const current = useRef(options);
  current.current = options;
  const repaint = useRef(() => {}),
    cancel = useRef(() => {});
  useEffect(() => {
    const api = options.scene;
    if (!api) return;
    const canvas = api.renderer.domElement,
      overlay = new Group();
    api.scene.add(overlay);
    const ray = new Raycaster();
    let down: { x: number; y: number; id: number } | null = null;
    let gesture: {
      source: ModelDocument;
      selection: MeshSelection;
      object: ModelObject;
      start: Vector3;
      plane: Plane;
      x: number;
      y: number;
      preview: ModelDocument | null;
    } | null = null;
    let frame = 0,
      disposed = false,
      queued: (() => void) | null = null;
    const offset = () =>
      surfaceLocal(
        [...current.current.document.origin, 0],
        api.origin() || current.current.document.origin,
      );
    const world = (object: ModelObject, id: string) =>
      new Vector3(
        ...add3(
          transformPoint(object.vertices[id], object.transform),
          offset() as Vec3,
        ),
      );
    const clear = () => {
      for (const item of overlay.children.slice()) {
        overlay.remove(item);
        if (item instanceof Points || item instanceof LineSegments) {
          item.geometry.dispose();
          (item.material as PointsMaterial | LineBasicMaterial).dispose();
        }
      }
    };
    const redraw = () => {
      clear();
      const { selection } = current.current;
      const document = gesture?.preview || current.current.document;
      const object = document.objects.find((o) => o.id === selection?.objectId);
      if (!object || !selection || !api.origin()) {
        api.alignMesh(null);
        api.draw();
        return;
      }
      const vertices = selectedVertices(object, selection),
        set = new Set(vertices),
        segments: number[] = [];
      for (const edge of modelEdges(object))
        if (
          selection.kind === 'object' ||
          (selection.kind === 'edge'
            ? selection.ids.includes(edge.id)
            : edge.vertices.every((id) => set.has(id)))
        )
          segments.push(
            ...world(object, edge.vertices[0]).toArray(),
            ...world(object, edge.vertices[1]).toArray(),
          );
      const lines = new BufferGeometry();
      lines.setAttribute('position', new Float32BufferAttribute(segments, 3));
      overlay.add(
        new LineSegments(
          lines,
          new LineBasicMaterial({
            color: '#168aff',
            depthTest: false,
            transparent: true,
            opacity: 0.95,
          }),
        ),
      );
      if (selection.kind === 'vertex') {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(
            vertices.flatMap((id) => world(object, id).toArray()),
            3,
          ),
        );
        overlay.add(
          new Points(
            geometry,
            new PointsMaterial({
              color: '#ffad29',
              size: 12,
              sizeAttenuation: false,
              depthTest: false,
            }),
          ),
        );
      }
      if (current.current.surface) {
        const face =
          object.faces.find(
            (f) => selection.kind === 'face' && selection.ids.includes(f.id),
          ) || object.faces[0];
        if (face) {
          const points = face.corners.map(
              (c) => world(object, c.vertex).toArray() as Vec3,
            ),
            centre = centre3(points),
            normal = faceNormal(
              {
                ...object,
                vertices: Object.fromEntries(
                  face.corners.map((c) => [
                    c.vertex,
                    world(object, c.vertex).toArray() as Vec3,
                  ]),
                ),
              },
              face,
            );
          api.alignMesh({
            key: `${object.id}:${face.id}`,
            objectId: object.id,
            centre,
            normal,
            width: Math.max(
              8,
              ...points.map(
                (p) => Math.hypot(...p.map((n, i) => n - centre[i])) * 3,
              ),
            ),
          });
        }
      } else api.alignMesh(null);
      api.draw();
    };
    repaint.current = redraw;
    const setRay = (x: number, y: number) => {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new Vector2(
          ((x - bounds.left) / bounds.width) * 2 - 1,
          1 - ((y - bounds.top) / bounds.height) * 2,
        ),
        api.camera(),
      );
    };
    const hit = (x: number, y: number) => {
      setRay(x, y);
      const result = ray
        .intersectObjects(api.group.children, false)
        .find(
          (h) =>
            !current.current.surface ||
            (h.object.userData.part as ModelMesh)?.surfaces?.some(
              (s) => s.objectId === current.current.selection?.objectId,
            ),
        );
      if (!result || !(result.object instanceof Mesh)) return;
      const part = result.object.userData.part as ModelMesh,
        triangle =
          result.object.userData.triangles?.[result.faceIndex!] ??
          result.faceIndex;
      const surface = part.surfaces?.find(
        (s) => triangle >= s.start && triangle < s.start + s.count,
      );
      const object = current.current.document.objects.find(
        (o) => o.id === surface?.objectId,
      );
      if (!object || object.hidden) return;
      const face = object.faces.find((f) => f.id === surface?.faceId);
      return { object, face, point: result.point };
    };
    const pick = (x: number, y: number, multi: boolean) => {
      const h = hit(x, y);
      if (!h) return;
      const { kind, selection } = current.current;
      let ids: string[] = [];
      if (kind === 'face' && h.face) ids = [h.face.id];
      else if ((kind === 'vertex' || kind === 'edge') && h.face) {
        const bounds = canvas.getBoundingClientRect(),
          project = (id: string) => {
            const p = world(h.object, id).project(api.camera());
            return [
              bounds.left + ((p.x + 1) * bounds.width) / 2,
              bounds.top + ((1 - p.y) * bounds.height) / 2,
            ];
          };
        const candidates =
          kind === 'vertex'
            ? h.face.corners.map((c) => ({
                id: c.vertex,
                points: [project(c.vertex)],
              }))
            : modelEdges(h.object)
                .filter((e) => e.faces.includes(h.face!.id))
                .map((e) => ({ id: e.id, points: e.vertices.map(project) }));
        const distance = (points: number[][]) => {
          const a = points[0],
            b = points[1] || a,
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
              ),
            );
          return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        };
        candidates.sort((a, b) => distance(a.points) - distance(b.points));
        if (candidates[0]) ids = [candidates[0].id];
      }
      if (
        multi &&
        selection?.objectId === h.object.id &&
        selection.kind === kind
      )
        ids = ids.every((id) => selection.ids.includes(id))
          ? selection.ids.filter((id) => !ids.includes(id))
          : [...new Set([...selection.ids, ...ids])];
      current.current.onSelect({ objectId: h.object.id, kind, ids });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      queued = null;
      down = null;
      gesture = null;
      api.setGestureActive(false);
      current.current.onPreview(null);
      if (!disposed) redraw();
    };
    cancel.current = reset;
    const begin = (event: PointerEvent) => {
      if (current.current.disabled) return;
      if (!event.isPrimary) {
        reset();
        return;
      }
      down = { x: event.clientX, y: event.clientY, id: event.pointerId };
      const { selection, tool, document } = current.current;
      if (tool === 'select' || event.button !== 0 || !selection) return;
      const h = hit(event.clientX, event.clientY);
      if (!h || h.object.id !== selection.objectId) return;
      if (h.object.locked || (h.object.curve && selection.kind !== 'object')) {
        current.current.onError(
          h.object.locked
            ? 'Unlock the object before editing.'
            : 'Convert the curve to a mesh before dragging components.',
        );
        return;
      }
      const normal = api.camera().getWorldDirection(new Vector3()),
        plane = new Plane().setFromNormalAndCoplanarPoint(normal, h.point),
        start = ray.ray.intersectPlane(plane, new Vector3());
      if (!start) return;
      gesture = {
        source: document,
        selection,
        object: h.object,
        start,
        plane,
        x: event.clientX,
        y: event.clientY,
        preview: null,
      };
      api.setGestureActive(true);
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const move = (event: PointerEvent) => {
      if (!gesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const update = () => {
        if (!gesture) return;
        try {
          const { tool, axis, grid } = current.current;
          setRay(event.clientX, event.clientY);
          const at = ray.ray.intersectPlane(gesture.plane, new Vector3());
          if (!at) return;
          const delta = at.sub(gesture.start).toArray() as Vec3;
          const axisIndex = { x: 0, y: 1, z: 2 }[axis === 'free' ? 'z' : axis];
          const snap = (v: number) =>
            grid > 0 ? Math.round(v / grid) * grid : v;
          const value: Vec3 =
            tool === 'move'
              ? (delta.map((v, i) =>
                  axis === 'free' || i === axisIndex ? snap(v) : 0,
                ) as Vec3)
              : tool === 'rotate'
                ? [0, 0, 0]
                : [1, 1, 1];
          if (tool === 'rotate')
            value[axisIndex] = Math.round((event.clientX - gesture.x) * 0.5);
          if (tool === 'scale') {
            const factor = Math.max(
              0.01,
              1 + (event.clientX - gesture.x) / 150,
            );
            for (let i = 0; i < 3; i++)
              if (axis === 'free' || i === axisIndex) value[i] = factor;
          }
          if (tool === 'select') return;
          const result =
            gesture.selection.kind !== 'object'
              ? meshCommand(gesture.object, gesture.selection, {
                  kind: tool,
                  value,
                })
              : null;
          const next = !result
            ? transformModelHierarchy(
                gesture.source,
                gesture.object.id,
                tool,
                value,
              )
            : {
                ...gesture.source,
                objects: gesture.source.objects.map((o) =>
                  o.id === result.object.id ? result.object : o,
                ),
              };
          gesture.preview = next;
          current.current.onPreview(next);
          redraw();
        } catch (error) {
          current.current.onError(
            error instanceof Error ? error.message : String(error),
          );
        }
      };
      queued = update;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        queued = null;
        update();
      });
    };
    const up = (event: PointerEvent) => {
      if (gesture) {
        event.preventDefault();
        event.stopImmediatePropagation();
        queued?.();
        const next = gesture?.preview;
        reset();
        if (next) current.current.onCommit(next);
      } else if (
        down &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5
      )
        pick(
          event.clientX,
          event.clientY,
          event.shiftKey || current.current.multi,
        );
      down = null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture) {
        event.preventDefault();
        event.stopPropagation();
        reset();
      }
    };
    let width = canvas.clientWidth,
      height = canvas.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width !== canvas.clientWidth || height !== canvas.clientHeight) {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        if (gesture) reset();
        else redraw();
      }
    });
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', begin, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', reset);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    api.controls.addEventListener('change', redraw);
    redraw();
    return () => {
      disposed = true;
      observer.disconnect();
      reset();
      api.alignMesh(null);
      clear();
      api.scene.remove(overlay);
      api.controls.removeEventListener('change', redraw);
      canvas.removeEventListener('pointerdown', begin, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', reset);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      repaint.current = () => {};
      cancel.current = () => {};
    };
  }, [options.scene]);
  useEffect(() => {
    repaint.current();
  }, [options.document, options.selection, options.surface]);
  useEffect(() => {
    cancel.current();
  }, [options.tool, options.kind, options.axis]);
}
