import { Box3, Triangle, Vector3 } from 'three';
import type { ModelMesh } from '../src/visual-types';

type Node = { box: Box3; left?: Node; right?: Node; triangles?: Triangle[] };
function triangles(meshes: ModelMesh[]) {
  const result: Triangle[] = [];
  for (const mesh of meshes)
    for (let i = 0; i < mesh.indices.length; i += 3)
      result.push(
        new Triangle(
          ...(mesh.indices
            .slice(i, i + 3)
            .map(
              (v) =>
                new Vector3(
                  ...(mesh.positions.slice(v * 3, v * 3 + 3) as [
                    number,
                    number,
                    number,
                  ]),
                ),
            ) as [Vector3, Vector3, Vector3]),
        ),
      );
  return result;
}
function tree(items: Triangle[]): Node {
  const box = new Box3();
  for (const t of items) {
    box.expandByPoint(t.a);
    box.expandByPoint(t.b);
    box.expandByPoint(t.c);
  }
  if (items.length <= 12) return { box, triangles: items };
  const extent = box.getSize(new Vector3()).toArray(),
    axis = extent.indexOf(Math.max(...extent));
  items.sort(
    (a, b) =>
      a.a.getComponent(axis) +
      a.b.getComponent(axis) +
      a.c.getComponent(axis) -
      b.a.getComponent(axis) -
      b.b.getComponent(axis) -
      b.c.getComponent(axis),
  );
  const middle = Math.floor(items.length / 2);
  return {
    box,
    left: tree(items.slice(0, middle)),
    right: tree(items.slice(middle)),
  };
}

/** Upper bound: distance to one retained triangle is convex over each omitted triangle. */
export function modelLodError(full: ModelMesh[], retained: ModelMesh[]) {
  const ids = new Set(retained.map((m) => m.surfaces?.[0]?.objectId));
  const omitted = full.filter((m) => !ids.has(m.surfaces?.[0]?.objectId));
  if (!omitted.length) return 0;
  const kept = triangles(retained);
  if (!kept.length)
    throw new Error('Every detail level needs retained structural geometry.');
  const root = tree(kept),
    center = new Vector3(),
    closest = new Vector3();
  let error = 0;
  const nearest = (point: Vector3) => {
    let distance = Infinity,
      candidate = kept[0];
    const visit = (node: Node) => {
      if (node.box.distanceToPoint(point) > distance) return;
      if (node.triangles)
        for (const triangle of node.triangles) {
          const d = triangle
            .closestPointToPoint(point, closest)
            .distanceTo(point);
          if (d < distance) {
            distance = d;
            candidate = triangle;
          }
        }
      else {
        const a = node.left!,
          b = node.right!;
        if (a.box.distanceToPoint(point) < b.box.distanceToPoint(point)) {
          visit(a);
          visit(b);
        } else {
          visit(b);
          visit(a);
        }
      }
    };
    visit(root);
    return { candidate, distance };
  };
  const bound = (source: Triangle, depth = 0): number => {
    source.getMidpoint(center);
    const { candidate, distance } = nearest(center);
    const points = [source.a, source.b, source.c];
    const upper = Math.max(
      ...points.map((p) =>
        candidate.closestPointToPoint(p, closest).distanceTo(p),
      ),
    );
    if (upper <= error || upper - distance <= 0.05 || depth >= 20) return upper;
    // A long trim triangle may span many retained wall triangles. Subdivision
    // tightens the conservative bound without treating sampled distances as proof.
    const lengths = points.map((p, i) =>
      p.distanceToSquared(points[(i + 1) % 3]),
    );
    const edge = lengths.indexOf(Math.max(...lengths));
    const a = points[edge],
      b = points[(edge + 1) % 3],
      c = points[(edge + 2) % 3];
    const middle = a.clone().add(b).multiplyScalar(0.5);
    return Math.max(
      bound(new Triangle(a, middle, c), depth + 1),
      bound(new Triangle(middle, b, c), depth + 1),
    );
  };
  for (const source of triangles(omitted)) {
    error = Math.max(error, bound(source));
  }
  return Math.ceil(error * 1000) / 1000;
}
