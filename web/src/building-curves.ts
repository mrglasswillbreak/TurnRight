import type { Feature } from 'geojson';
import type { ArchitecturalCurve } from './model-document.js';
export function buildingCurves(feature:Feature):ArchitecturalCurve[] {
  return feature.properties?.modelDocument?.curves || feature.properties?.surfaceCurves || [];
}
export const curvedWall = (feature:Feature,wallId:string) => buildingCurves(feature).find(c=>c.wallIds.includes(wallId));
export function pathDistances(points:number[][]) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  return {lengths,total:lengths.reduce((s,n)=>s+n,0)};
}
export function alongPath(points:number[][],distance:number) {
  const {lengths,total}=pathDistances(points);let offset=Math.max(0,Math.min(total,distance)),index=0;
  while(index<lengths.length-1 && offset>lengths[index])offset-=lengths[index++];
  const length=lengths[index]||1,a=points[index],b=points[index+1],t=offset/length;
  return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],right:[(b[1]-a[1])/length,-(b[0]-a[0])/length],index};
}
