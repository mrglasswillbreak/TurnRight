import { DoubleSide, FrontSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { ModelRenderMaterial } from './model-render-types';
export function createModelRenderMaterial(source:ModelRenderMaterial,redraw:()=>void) {
  const material=new MeshStandardMaterial({color:source.colour,opacity:source.opacity,transparent:source.opacity<1,roughness:source.roughness,metalness:source.metalness,side:source.doubleSided?DoubleSide:FrontSide,emissive:source.emissive||'#000000',alphaTest:source.alphaTest||0});
  const textures:Texture[]=[];let disposed=false;
  for(const [slot,url] of Object.entries(source.maps||{})) {
    const texture=new TextureLoader().load(url,()=>{if(disposed){texture.dispose();return;}material.needsUpdate=true;redraw();},undefined,()=>{if(!disposed)redraw();});
    texture.wrapS=texture.wrapT=RepeatWrapping;
    const settings=source.textureSettings?.[slot as keyof NonNullable<typeof source.textureSettings>];
    if(settings){texture.flipY=settings.flipY;texture.wrapS=settings.wrapS as typeof RepeatWrapping;texture.wrapT=settings.wrapT as typeof RepeatWrapping;texture.offset.fromArray(settings.offset);texture.repeat.fromArray(settings.repeat);texture.rotation=settings.rotation;}
    if(slot==='baseMap'||slot==='emissiveMap')texture.colorSpace=SRGBColorSpace;
    const key=slot==='baseMap'?'map':slot;
    if(key==='map'||key==='normalMap'||key==='roughnessMap'||key==='metalnessMap'||key==='emissiveMap')material[key]=texture;
    textures.push(texture);
  }
  return {material,release:()=>{disposed=true;for(const texture of textures)texture.dispose();}};
}
