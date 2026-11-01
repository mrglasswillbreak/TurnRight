import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
} from 'three';
import { buildingOutline } from './building-outline';
import type { BuildingSelection } from './visual-types';

export function updateModelSelection(
  groups: Group[],
  selection: BuildingSelection | undefined,
  dark: boolean,
  mode: string,
  zoom: number,
  selectedId: string,
) {
  for (const group of groups) {
    const key = JSON.stringify([selection, group.userData.revision]);
    for (const child of group.children)
      if (child instanceof LineSegments)
        (child.material as LineBasicMaterial).color.set(
          dark ? '#89c6ff' : '#1764ed',
        );
    for (const mesh of group.children)
      if (mesh instanceof Mesh) {
        mesh.visible = !(
          ((mesh.userData.detail && mode !== 'detailed') ||
            zoom < (mesh.userData.minZoom || 0)) &&
          group.userData.buildingId !== selectedId
        );
        mesh.renderOrder = mesh.userData.detail ? 1 : 0;
      }
    if (group.userData.selectionKey === key) continue;
    group.userData.selectionKey = key;
    for (const child of group.children.slice())
      if (child instanceof LineSegments) {
        group.remove(child);
        child.geometry.dispose();
        (child.material as LineBasicMaterial).dispose();
      }
    if (!selection || selection.buildingId !== group.userData.buildingId)
      continue;
    const positions: number[] = [];
    for (const mesh of group.children)
      if (mesh instanceof Mesh && mesh.geometry.index)
        for (const coordinate of buildingOutline(
          {
            positions: mesh.geometry.getAttribute('position').array,
            indices: mesh.geometry.index.array,
            surfaces: mesh.userData.surfaces,
          },
          selection,
        ))
          positions.push(coordinate);
    if (positions.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      const line = new LineSegments(
        geometry,
        new LineBasicMaterial({
          color: dark ? '#89c6ff' : '#1764ed',
          depthTest: false,
          transparent: true,
          opacity: 0.75,
        }),
      );
      line.renderOrder = 5;
      group.add(line);
    }
  }
}
