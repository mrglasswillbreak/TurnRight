import type { MapEdit } from './types.js';
import { buildingTopology, polygonsOf, remapBuildingSurfaces } from './building-surfaces.js';
import { modelFeature } from './model-authoring.js';
import { centre3, modelId, newModelDocument, type ModelCurveSegment, type ModelDocument, type Vec3 } from './model-document.js';
import { ellipseCurve, sampleCurveSegment } from './model-curves.js';

export function documentForBuilding(edit:MapEdit):ModelDocument {
  if(edit.properties.modelDocument)return edit.properties.modelDocument;
  const centre=centre3(polygonsOf(edit.geometry).flat(2).map(p=>[p[0],p[1],0]));
  return newModelDocument([centre[0],centre[1]]);
}
export function modelCoordinates(origin:[number,number]) {
  const k=Math.PI/180*6371008.8,sx=k*Math.cos(origin[1]*Math.PI/180);
  return {
    local:(p:number[]):Vec3=>[(p[0]-origin[0])*sx,(p[1]-origin[1])*k,p[2]||0],
    geographic:(p:Vec3):[number,number]=>[origin[0]+p[0]/sx,origin[1]+p[1]/k],
  };
}
function remap(edit:MapEdit,polygons:number[][][][]) {
  return remapBuildingSurfaces(edit,polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons});
}
export function addBuildingBoundary(edit:MapEdit,kind:'wing'|'courtyard'|'replace',points:number[][],part=0,ring=0,start=0,end=1):MapEdit {
  if(points.some(p=>p.length<2||!p.every(Number.isFinite)))throw new Error('Boundary coordinates must be finite.');
  const polygons=structuredClone(polygonsOf(edit.geometry));
  if(kind==='replace') {
    const old=polygons[part]?.[ring]?.slice(0,-1);
    if(!old||start===end||!old[start]||!old[end]||points.length<2)throw new Error('Choose different start and end vertices, then draw the replacement boundary.');
    const replacement=[[...old[start]],...points.slice(1,-1),[...old[end]]];
    for(let i=(end+1)%old.length;i!==start;i=(i+1)%old.length)replacement.push(old[i]);
    replacement.push([...replacement[0]]);polygons[part][ring]=replacement;
  } else {
    if(points.length<3)throw new Error('A wing or courtyard needs at least three points.');
    const closed=points.map(p=>p.slice(0,2));
    if(JSON.stringify(closed[0])!==JSON.stringify(closed.at(-1)))closed.push([...closed[0]]);
    if(kind==='wing')polygons.push([closed]);
    else {if(!polygons[part])throw new Error('Select a wing for the courtyard.');polygons[part].push(closed);}
  }
  return remap(edit,polygons);
}
export function setBoundaryCurve(edit:MapEdit,part:number,ring:number,vertex:number,segment:ModelCurveSegment):MapEdit {
  const source=documentForBuilding(edit),coordinates=modelCoordinates(source.origin);
  const topology=buildingTopology(modelFeature(edit)),oldRing=topology.parts[part]?.rings[ring];
  if(!oldRing)throw new Error('Select an existing boundary edge.');
  const existing=source.curves.find(c=>c.wallIds.includes(oldRing.wallIds[vertex]));
  const startIndex=existing?oldRing.vertexIds.indexOf(existing.startVertexId):vertex;
  const endIndex=existing?oldRing.vertexIds.indexOf(existing.endVertexId):(vertex+1)%oldRing.vertexIds.length;
  const polygon=polygonsOf(edit.geometry)[part][ring];
  if(startIndex<0||endIndex<0)throw new Error('The curve anchors changed. Recreate this curve from the current boundary.');
  const start=coordinates.local(polygon[startIndex]);
  const nextSegment={...segment,id:existing?.id||segment.id,end:coordinates.local(polygon[endIndex])};
  const samples=sampleCurveSegment(start,nextSegment);
  const next=addBuildingBoundary(edit,'replace',samples.map(p=>coordinates.geographic(p.point)),part,ring,startIndex,endIndex);
  const nextTopology=buildingTopology(modelFeature(next)),nextRing=nextTopology.parts[part].rings[ring];
  // The edited span starts the rotated ring; preserve one logical wall identity.
  const logicalWall=existing?.wallIds[0]||oldRing.wallIds[startIndex];
  nextRing.wallIds[0]=logicalWall;
  next.properties.buildingTopology=nextTopology;
  const document=structuredClone(source);
  document.curves=document.curves.filter(c=>c.id!==existing?.id);
  if(segment.kind!=='line')document.curves.push({id:nextSegment.id,partId:nextTopology.parts[part].id,ringId:nextRing.id,startVertexId:nextRing.vertexIds[0],endVertexId:nextRing.vertexIds[samples.length-1],wallIds:nextRing.wallIds.slice(0,samples.length-1),vertexIds:nextRing.vertexIds.slice(0,samples.length),start,segment:nextSegment});
  next.properties.modelDocument=document;
  const appearance=next.properties.appearance||{},oldAppearance=edit.properties.appearance||{};
  const wallStyle=oldAppearance.walls?.[logicalWall];
  if(wallStyle) for(const id of nextRing.wallIds.slice(0,samples.length-1))(appearance.walls||={})[id]=structuredClone(wallStyle);
  if(nextTopology.issues)nextTopology.issues=nextTopology.issues.filter(i=>!i.wallId||!nextRing.wallIds.slice(0,samples.length-1).includes(i.wallId));
  const facade=oldAppearance.facades?.[logicalWall];
  if(facade)(appearance.facades||={})[logicalWall]={...structuredClone(facade),wallCoordinates:samples.map(p=>coordinates.geographic(p.point)),needsReview:true,reviewedAt:undefined};
  next.properties.appearance=appearance;
  return next;
}
export function roundBoundaryCorner(edit:MapEdit,part:number,ring:number,vertex:number,radius:number):MapEdit {
  if(!Number.isFinite(radius)||radius<=0)throw new Error('Corner radius must be positive.');
  const document=documentForBuilding(edit),convert=modelCoordinates(document.origin),polygons=structuredClone(polygonsOf(edit.geometry));
  const points=polygons[part][ring].slice(0,-1),p=convert.local(points[vertex]),a=convert.local(points[(vertex+points.length-1)%points.length]),b=convert.local(points[(vertex+1)%points.length]);
  const lengthA=Math.hypot(a[0]-p[0],a[1]-p[1]),lengthB=Math.hypot(b[0]-p[0],b[1]-p[1]);
  const u=[(a[0]-p[0])/lengthA,(a[1]-p[1])/lengthA],v=[(b[0]-p[0])/lengthB,(b[1]-p[1])/lengthB];
  const angle=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1]))),distance=radius/Math.tan(angle/2);
  if(!Number.isFinite(distance)||distance>=Math.min(lengthA,lengthB)*0.49)throw new Error('Choose a smaller radius that fits both adjoining edges.');
  const start:Vec3=[p[0]+u[0]*distance,p[1]+u[1]*distance,0],end:Vec3=[p[0]+v[0]*distance,p[1]+v[1]*distance,0];
  const bisector=Math.hypot(u[0]+v[0],u[1]+v[1]),offset=radius/Math.sin(angle/2)-radius;
  const through:Vec3=[p[0]+(u[0]+v[0])/bisector*offset,p[1]+(u[1]+v[1])/bisector*offset,0];
  points.splice(vertex,1,convert.geographic(start),convert.geographic(end));points.push([...points[0]]);polygons[part][ring]=points;
  const next=remap(edit,polygons);next.properties.modelDocument=document;
  return setBoundaryCurve(next,part,ring,vertex,{id:modelId(),kind:'arc',through,end});
}
export function addEllipseBoundary(edit:MapEdit,kind:'wing'|'courtyard',centre:Vec3,width:number,depth:number,part=0):MapEdit {
  if(![width,depth].every(n=>Number.isFinite(n)&&n>0&&n<=500))throw new Error('Ellipse dimensions must be between zero and 500 metres.');
  const doc=structuredClone(documentForBuilding(edit)),convert=modelCoordinates(doc.origin),profile=ellipseCurve(width,depth);
  let start=profile.start;const points:Vec3[]=[],spans:{start:Vec3;segment:ModelCurveSegment;count:number}[]=[];
  for(const s of profile.segments) {
    const translate=(p:Vec3):Vec3=>[p[0]+centre[0],p[1]+centre[1],p[2]];
    const segment={...s,id:modelId(),end:translate(s.end),...(s.kind==='bezier'?{control1:translate(s.control1),control2:translate(s.control2)}:{})} as ModelCurveSegment;
    const a=translate(start),samples=sampleCurveSegment(a,segment);points.push(...samples.slice(0,-1).map(p=>p.point));spans.push({start:a,segment,count:samples.length-1});start=s.end;
  }
  const next=addBuildingBoundary(edit,kind,points.map(convert.geographic),part);
  const topology=buildingTopology(modelFeature(next)),p=kind==='wing'?topology.parts.length-1:part,r=kind==='wing'?0:topology.parts[p].rings.length-1,ring=topology.parts[p].rings[r];
  let offset=0;
  for(const span of spans){doc.curves.push({id:span.segment.id,partId:topology.parts[p].id,ringId:ring.id,startVertexId:ring.vertexIds[offset],endVertexId:ring.vertexIds[(offset+span.count)%ring.vertexIds.length],wallIds:ring.wallIds.slice(offset,offset+span.count),vertexIds:Array.from({length:span.count+1},(_,i)=>ring.vertexIds[(offset+i)%ring.vertexIds.length]),start:span.start,segment:span.segment});offset+=span.count;}
  next.properties.modelDocument=doc;return next;
}
