import type { ModelMaterial } from './model-document.js';
export type ModelRenderMaterial = Omit<
  ModelMaterial,
  'baseMap' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap'
> & {
  maps?: Partial<
    Record<
      'baseMap' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap',
      string
    >
  >;
};

export function validModelRenderMaterial(value:ModelRenderMaterial):boolean {
  return !!value && typeof value==='object' && typeof value.id==='string' && value.id.length<=240 &&
    /^#[a-f\d]{6}$/i.test(value.colour) && [value.opacity,value.roughness,value.metalness].every(n=>Number.isFinite(n)&&n>=0&&n<=1) && typeof value.doubleSided==='boolean' &&
    (value.emissive===undefined||/^#[a-f\d]{6}$/i.test(value.emissive)) &&
    (value.alphaTest===undefined||(Number.isFinite(value.alphaTest)&&value.alphaTest>=0&&value.alphaTest<=1)) &&
    (value.maps===undefined||(!!value.maps&&typeof value.maps==='object'&&!Array.isArray(value.maps)&&Object.entries(value.maps).every(([slot,url])=>['baseMap','normalMap','roughnessMap','metalnessMap','emissiveMap'].includes(slot)&&typeof url==='string'&&url.length<6*1024*1024&&(/^(data:image\/(png|jpeg|webp);base64,[a-z\d+/]+={0,2})$/i.test(url)||/^\/packages\/model-texture-[a-f\d]{64}\.(png|jpg|webp)$/.test(url)))));
}
