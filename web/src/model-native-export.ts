import { createFacadeTextures } from './facade-textures';
import { defaultModelMaterial, modelId } from './model-document';
import type { ModelMesh } from './visual-types';
import type { CampusData } from './types';
/** Bake the existing photo and text recipes before native geometry becomes a standard mesh. */
export async function bakeNativeModelMeshes(
  meshes: ModelMesh[],
  data: CampusData,
): Promise<ModelMesh[]> {
  const textures = createFacadeTextures(() => {}),
    releases: (() => void)[] = [];
  try {
    const result: ModelMesh[] = [];
    for (const mesh of meshes) {
      const recipe = mesh.text || mesh.texture;
      if (!recipe) {
        result.push(mesh);
        continue;
      }
      const pixels = await new Promise<{
        data: ArrayLike<number>;
        width: number;
        height: number;
      }>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                'A building photo or text texture could not be exported. Restore its reference before retrying.',
              ),
            ),
          15000,
        );
        releases.push(
          textures.acquire(recipe, data, (texture) => {
            clearTimeout(timer);
            resolve(texture.image);
          }),
        );
      });
      const canvas = document.createElement('canvas');
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      canvas
        .getContext('2d')!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(pixels.data),
            pixels.width,
            pixels.height,
          ),
          0,
          0,
        );
      result.push({
        ...mesh,
        texture: undefined,
        text: undefined,
        material: {
          ...defaultModelMaterial(),
          id: modelId(),
          colour: '#ffffff',
          doubleSided: true,
          alphaTest: 0.01,
          maps: { baseMap: canvas.toDataURL('image/png') },
        },
      });
    }
    return result;
  } finally {
    for (const release of releases) release();
    textures.dispose();
  }
}
