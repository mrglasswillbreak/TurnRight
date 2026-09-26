import { useEffect, useState } from 'react';
import { Plus, Check, X, Undo2, Spline, Circle } from 'lucide-react';
import { ModelButton } from './ModelButton';
import type { MapEdit } from './types';
import type { EditorWorkspace } from './editor-workspace';
import { buildingTopology, polygonsOf } from './building-surfaces';
import { modelFeature } from './model-authoring';
import { documentForBuilding, modelCoordinates, addBuildingBoundary, addEllipseBoundary, roundBoundaryCorner, setBoundaryCurve } from './model-architecture';
import { modelId, type ModelCurveSegment, type Vec3 } from './model-document';

type Drawing={kind:'replace'|'wing'|'courtyard';shape:'line'|'ellipse'|'circle';points:number[][];start:number[];end:number; width:string;depth:string};
export function useOutlineTools(edit:MapEdit,selected:number[],onCommit:(edit:MapEdit)=>boolean,workspace?:EditorWorkspace) {
  const recoveryKey='architectural-drawing';
  const [drawing,setDrawing]=useState<Drawing|null>(()=>{
    try { const value=workspace?.modelInputs[edit.id]?.[recoveryKey];return value?JSON.parse(value):null; }catch{return null;}
  });
  const [error,setError]=useState(''),[curveKind,setCurveKind]=useState<'line'|'arc'|'bezier'>('arc'),[amount,setAmount]=useState('2'),[controls,setControls]=useState(['2','2','4','2']);
  const [east,setEast]=useState('0'),[north,setNorth]=useState('0');
  const polygons=polygonsOf(edit.geometry),doc=documentForBuilding(edit),convert=modelCoordinates(doc.origin);
  const topology=buildingTopology(modelFeature(edit));
  const [p,r,v]=selected,ring=topology.parts[p]?.rings[r],curve=doc.curves.find(c=>c.wallIds.includes(ring?.wallIds[v]));
  const startIndex=curve?ring.vertexIds.indexOf(curve.startVertexId):v,endIndex=curve?ring.vertexIds.indexOf(curve.endVertexId):(v+1)%(ring?.vertexIds.length||1);
  const a=polygons[p]?.[r]?.[startIndex],b=polygons[p]?.[r]?.[endIndex];
  const key=`${edit.id}:${selected.join(':')}`;
  useEffect(()=>{
    if(!a||!b)return;
    const start=convert.local(a),end=convert.local(b);
    setEast(String(start[0].toFixed(2)));setNorth(String(start[1].toFixed(2)));
    if(curve) {
      setCurveKind(curve.segment.kind);
      if(curve.segment.kind==='bezier')setControls([curve.segment.control1[0]-start[0],curve.segment.control1[1]-start[1],curve.segment.control2[0]-start[0],curve.segment.control2[1]-start[1]].map(n=>String(+n.toFixed(3))));
    } else setControls([(end[0]-start[0])/3,(end[1]-start[1])/3,(end[0]-start[0])*2/3,(end[1]-start[1])*2/3].map(n=>String(+n.toFixed(3))));
  },[key]);
  const recover=(next:Drawing|null)=>{
    setDrawing(next);workspace?.recoverModelInput(edit.id,recoveryKey,next?JSON.stringify(next):undefined);
  };
  const run=(create:()=>MapEdit)=>{
    try { const next=create();if(onCommit(next)){setError('');recover(null);return true;}setError('The boundary needs repair. Your drawing is retained; check the validation notice.'); }
    catch(error){setError(error instanceof Error?error.message:String(error));}return false;
  };
  const begin=()=>recover({kind:'replace',shape:'line',points:[],start:[...selected],end:endIndex,width:'8',depth:'6'});
  const tap=(point:number[],exact=false)=>{
    if(!drawing)return false;
    if(!point.every(Number.isFinite)){setError('Enter finite boundary coordinates.');return false;}
    const local=convert.local(point),snapped=exact?point:convert.geographic(local.map(n=>Math.round(n*10)/10) as Vec3);
    recover({...drawing,points:drawing.shape==='line'?[...drawing.points,snapped]:[snapped]});return true;
  };
  const drawRing=drawing&&polygons[drawing.start[0]]?.[drawing.start[1]];
  const path=drawing?.kind==='replace'&&drawRing?[drawRing[drawing.start[2]],...drawing.points,drawRing[drawing.end]]:drawing?.points||[];
  const finish=()=>run(()=>{
    if(!drawing)throw new Error('Start a boundary drawing.');
    const [p,r,v]=drawing.start;
    if(drawing.shape!=='line') {
      if(drawing.kind==='replace')throw new Error('Choose a new wing or courtyard for a circular outline.');
      if(!drawing.points.length)throw new Error('Choose the centre on the model, or add its coordinates.');
      return addEllipseBoundary(edit,drawing.kind,convert.local(drawing.points[0]),Number(drawing.width),Number(drawing.shape==='circle'?drawing.width:drawing.depth),p);
    }
    return addBuildingBoundary(edit,drawing.kind,path,p,r,v,drawing.end);
  });
  const applyCurve=()=>run(()=>{
    if(!a||!b)throw new Error('Select a boundary edge.');
    const start=convert.local(a),end=convert.local(b),dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
    const common={id:curve?.id||modelId(),end};
    const segment:ModelCurveSegment=curveKind==='line'?{...common,kind:'line'}:curveKind==='arc'?{...common,kind:'arc',through:[(start[0]+end[0])/2-dy/length*Number(amount),(start[1]+end[1])/2+dx/length*Number(amount),0]}:{...common,kind:'bezier',control1:[start[0]+Number(controls[0]),start[1]+Number(controls[1]),0],control2:[start[0]+Number(controls[2]),start[1]+Number(controls[3]),0]};
    return setBoundaryCurve(edit,p,r,v,segment);
  });
  const field=(label:string,value:string,set:(value:string)=>void)=><label>{label}<input type="number" step="0.1" value={value} onChange={e=>set(e.target.value)}/></label>;
  return { drawing:!!drawing,path,tap,cancel:()=>recover(null), controls:<div className="model-outline-tools">
    {!drawing?<ModelButton icon={<Plus/>} variant="secondary" onClick={begin}>Add wall</ModelButton>:<fieldset>
      <legend>Draw building boundary</legend>
      <p>Tap points on the model or enter metre coordinates. Existing vertices snap exactly; other points use a 0.1 m grid.</p>
      <label>Boundary operation<select value={drawing.kind} onChange={e=>recover({...drawing,kind:e.target.value as Drawing['kind'],points:[]})}><option value="replace">Replace boundary between vertices</option><option value="wing">New wing</option><option value="courtyard">New courtyard</option></select></label>
      {drawing.kind==='replace'?<label>End boundary vertex<select value={drawing.end} onChange={e=>recover({...drawing,end:Number(e.target.value)})}>{drawRing?.slice(0,-1).map((_,i)=><option key={i} value={i} disabled={i===drawing.start[2]}>Vertex {i+1}</option>)}</select></label>:<label>Boundary shape<select value={drawing.shape} onChange={e=>recover({...drawing,shape:e.target.value as Drawing['shape'],points:[]})}><option value="line">Draw straight edges</option><option value="circle">Circle</option><option value="ellipse">Ellipse</option></select></label>}
      {drawing.shape!=='line'&&<div className="model-properties-grid">{field(drawing.shape==='circle'?'Diameter (m)':'Ellipse width (m)',drawing.width,width=>recover({...drawing,width}))}{drawing.shape==='ellipse'&&field('Ellipse depth (m)',drawing.depth,depth=>recover({...drawing,depth}))}</div>}
      <div className="model-properties-grid">{field('Boundary east (m)',east,setEast)}{field('Boundary north (m)',north,setNorth)}</div>
      <ModelButton icon={<Plus/>} onClick={()=>tap(convert.geographic([Number(east),Number(north),0]))}>Add boundary point</ModelButton>
      <p>{drawing.points.length} point{drawing.points.length===1?'':'s'} · relative to the building’s fixed editing origin</p>
      <div className="model-toolbar"><ModelButton icon={<Check/>} variant="default" onClick={finish}>Apply boundary</ModelButton><ModelButton icon={<Undo2/>} disabled={!drawing.points.length} onClick={()=>recover({...drawing,points:drawing.points.slice(0,-1)})}>Remove last point</ModelButton><ModelButton icon={<X/>} onClick={()=>recover(null)}>Cancel boundary</ModelButton></div>
    </fieldset>}
    <details><summary>Curves and rounded corners</summary>
      <p>Shape the edge after the selected vertex. Existing details retain their identity and require placement review.</p>
      <label>Edge shape<select value={curveKind} onChange={e=>setCurveKind(e.target.value as typeof curveKind)}><option value="line">Straight</option><option value="arc">Circular arc</option><option value="bezier">Bézier curve</option></select></label>
      {curveKind==='arc'&&field('Arc bulge (m)',amount,setAmount)}
      {curveKind==='bezier'&&<div className="model-properties-grid">{controls.map((value,i)=><div key={i}>{field(`Control ${Math.floor(i/2)+1} ${i%2?'north':'east'} (m)`,value,next=>setControls(old=>old.map((v,j)=>i===j?next:v)))}</div>)}</div>}
      <ModelButton icon={<Spline/>} onClick={applyCurve}>Apply edge shape</ModelButton>
      {field('Corner radius (m)',amount,setAmount)}
      <ModelButton icon={<Circle/>} onClick={()=>run(()=>roundBoundaryCorner(edit,p,r,v,Number(amount)))}>Round selected corner</ModelButton>
    </details>
    {error&&<p role="alert">{error}</p>}
  </div> };
}
