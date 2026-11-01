import {
  NeutralToneMapping,
  PMREMGenerator,
  SRGBColorSpace,
  type Scene,
  type WebGLRenderer,
  type AmbientLight,
  type DirectionalLight,
  type MeshStandardMaterial,
  type MeshLambertMaterial,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function applyModelLighting(
  materials: Iterable<{
    value: MeshStandardMaterial | MeshLambertMaterial;
    colour: string;
    authoredOpacity?: number;
    themeKey?: string;
  }>,
  ambient: AmbientLight,
  sun: DirectionalLight,
  options: { dark: boolean; opacity?: number },
) {
  ambient.intensity = options.dark ? 1.25 : 1.6;
  sun.intensity = options.dark ? 0.85 : 1.8;
  ambient.color.set('#ffffff');
  sun.color.set('#ffffff');
  const key = `${options.dark}:${options.opacity ?? 1}`;
  for (const entry of materials) {
    if (entry.themeKey === key) continue;
    entry.themeKey = key;
    entry.value.color.set(
      entry.value.map && entry.authoredOpacity === undefined
        ? '#ffffff'
        : entry.colour,
    );
    entry.value.opacity = (options.opacity ?? 1) * (entry.authoredOpacity ?? 1);
    entry.value.transparent = entry.value.opacity < 1;
    entry.value.depthWrite = entry.value.opacity >= 0.7;
  }
}

/** Neutral studio reflections are shared by map presentation and export renders. */
export function modelEnvironment(renderer: WebGLRenderer, scene: Scene) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const generator = new PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const target = generator.fromScene(room, 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.65;
  generator.dispose();
  room.dispose();
  return () => {
    scene.environment = null;
    target.dispose();
  };
}
