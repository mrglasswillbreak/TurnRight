import type { ModelMesh } from './visual-types.js';
/** Wall-specific authoring must not imply a draw call per frame or wall. */
export function mergeModelMeshes(meshes: ModelMesh[]): ModelMesh[] {
  const merged = new Map<string, ModelMesh>();
  for (const source of meshes) {
    if (!source.indices.length) continue;
    const key = JSON.stringify([
      source.colour,
      source.detail,
      source.minZoom,
      source.surfaces?.[0]?.role,
      source.texture,
      source.text,
    ]);
    let target = merged.get(key);
    if (!target) {
      target = {
        text: source.text,
        positions: [],
        indices: [],
        colour: source.colour,
        detail: source.detail,
        ...(source.minZoom === undefined ? {} : { minZoom: source.minZoom }),
        surfaces: [],
        ...(source.texture ? { texture: source.texture } : {}),
        ...(source.uvs ? { uvs: [] } : {}),
      };
      merged.set(key, target);
    }
    const vertexOffset = target.positions.length / 3,
      triangleOffset = target.indices.length / 3;
    for (const position of source.positions) target.positions.push(position);
    for (const index of source.indices)
      target.indices.push(index + vertexOffset);
    for (const surface of source.surfaces || [])
      target.surfaces!.push({
        ...surface,
        start: surface.start + triangleOffset,
      });
    if (source.uvs) for (const uv of source.uvs) target.uvs!.push(uv);
  }
  return [...merged.values()];
}
