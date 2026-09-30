import fs from 'node:fs/promises';
import { buildingRevision } from '../web/src/building-visuals';
const base=JSON.parse(await fs.readFile('../data/raw/unilag-upgrade/unilag-before.json','utf8'));
const evidence=JSON.parse(await fs.readFile('../data/building-evidence.json','utf8'));
const photos=JSON.parse(await fs.readFile('../data/unilag-enrichment/photos.json','utf8'));
const prefix='import:4e362956-36db-49d4-884d-de4c7b933255:e5e49ffb:';
const definitions=[
  {id:'89',floors:14,wall:'#e3d7ba',roof:'#887762',trim:'#814d38',observed:'Cream concrete frame, dark glazing, red-brown vertical sun screens and stepped tower silhouette.',needed:'Architect describes 14 storeys; other sources describe 11, 12 or 13. Reconcile counting conventions and survey the separate lower chamber/wing heights. The overall tower height is an estimate, not a survey.'},
  {id:'87',floors:7,wall:'#e4ddc8',roof:'#9a9081',trim:'#846049',observed:'Six repeated upper window bands above the ground level in the dated full-front photograph; pale framed bays and brown infill.',needed:'OSM records four levels, conflicting with the photographed main block. Verify the separate wing heights and changes since the photograph.'},
  {id:'491',floors:3,wall:'#e8d6a9',roof:'#794e47',trim:'#8b594b',observed:'Three visible levels at the frontage; pale yellow walls, red-brown floor bands and roof parapet.',needed:'Survey metre heights, rear elevation and roof construction.'},
  {id:'26',floors:2,wall:'#e6d9b1',roof:'#7f4948',trim:'#8a584b',observed:'Two visible levels, cream walls, closely spaced vertical sunshades and red-brown parapet.',needed:'Confirm which auxiliary wings share the photographed main-block height.'},
  {id:'96',wall:'#c3bda6',roof:'#979684',trim:'#c6c0a8',observed:'Deep flat concrete canopy and tall vertical facade fins; library sign confirms identity.',needed:'Official library FAQ refers to a third floor but does not give a complete floor schedule. Height, basement/reading-hall levels and canopy dimensions remain unverified.'},
  {id:'94',wall:'#bcc8ca',roof:'#748993',trim:'#91a0a8',observed:'Glazed frontage with horizontal roof planes and Akintunde Ojo Hall sign.',needed:'Survey heights and verify the geometry of overhangs and rear elevations.'},
  {id:'292',wall:'#e7d7af',roof:'#a64635',trim:'#755747',roofForm:'gable',observed:'Pale auditorium walls, glazed facade and a prominent pitched red roof in the reviewed entrance view.',needed:'Eave height, roof pitch and ridge position are approximate; a roof plan is needed.'},
  {id:'99',wall:'#d4c29e',roof:'#878072',trim:'#6d756c',observed:'Cream and tan engineering complex with dark horizontal sunshade bands.',needed:'The courtyard view contains multiple wings; individual heights and rear facades remain unresolved.'},
  {id:'261',wall:'#c6bfa9',roof:'#848578',trim:'#92947e',observed:'Concrete facade with repeated vertical supports and horizontal shading.',needed:'Total floors, roof material and correspondence of every wing require field verification.'},
  {id:'524',wall:'#e0cea7',roof:'#886655',trim:'#916751',observed:'Cream and brown facade; Faculty of Management Sciences sign visible.',needed:'Vegetation obscures parts of the facade. Survey total height, windows and roof form.'},
];
for(const photo of photos){
  const id='unilag-'+photo.id;
  if(!evidence.references.some((r:any)=>r.id===id))evidence.references.push({id,url:photo.sourceUrl,author:photo.author,license:photo.license,licenseUrl:photo.licenseUrl,date:photo.capturedAt||'Unknown',checkedAt:'2026-09-30'});
}
const architect={id:'unilag-senate-architect',url:'https://www.linkedin.com/posts/james-cubitt-architects_jamescubittarchitects-throwbackthursday-activity-7480199015004037120-Eema',author:'James Cubitt Architects',license:'Factual architectural reference only; no photograph reproduced',date:'2026-09-30'};
if(!evidence.references.some((r:any)=>r.id===architect.id))evidence.references.push(architect);
for(const d of definitions){
  const id=prefix+d.id, feature=base.map.features.find((f:any)=>f.properties.id===id), refs=photos.filter((p:any)=>p.buildingId===id);
  const inferred=['Colours are approximate matches to dated photographs; current finishes may differ.','Window spacing, hidden elevations, trim thickness and roof geometry remain illustrative.',...(d.floors?['Height uses 3 m per floor; no measured height is claimed.']:['Height unknown: retain the labelled illustrative 6 m block.'])];
  const appearance={wallColour:d.wall,roofColour:d.roof,trimColour:d.trim,windowColour:'#697f84',roofForm:d.roofForm||'flat',windows:!!d.floors,windowSpacing:4,confidence:'observed',provenance:`Exterior references reviewed 2026-09-30. ${d.observed} ${d.needed}`,photoEvidence:{photoIds:refs.map((p:any)=>p.id),observed:[d.observed],estimated:inferred,needed:[d.needed],checkedAt:'2026-09-30'}};
  evidence.buildings[id]={level:d.floors?'detailed':'simplified',...(d.floors?{floors:d.floors}:{}),roofForm:d.roofForm||'flat',wallColour:d.wall,roofColour:d.roof,sources:[...refs.map((p:any)=>'unilag-'+p.id),...(d.id==='89'?[architect.id]:[])],observed:[d.observed],inferred,needed:[d.needed],appearance,footprintRevisions:[buildingRevision({...feature,properties:{}})]};
}
await fs.writeFile('../data/building-evidence.json',JSON.stringify(evidence,null,2)+'\n');
const changes=JSON.parse(await fs.readFile('../data/unilag-enrichment/changes.json','utf8'));
for(const d of definitions){
  const id=prefix+d.id, appearance=evidence.buildings[id].appearance;
  let change=changes.featureUpdates.find((f:any)=>f.id===id);
  if(!change){change={id,properties:{}};changes.featureUpdates.push(change);}
  change.properties.appearance=appearance;
}
await fs.writeFile('../data/unilag-enrichment/changes.json',JSON.stringify(changes,null,2)+'\n');
console.log(`${definitions.length} footprint-bound architectural references, ${definitions.filter(d=>d.floors).length} source/photograph-derived heights`);
