/** Apply a reviewed additive campus patch using the existing guarded reconciliation. */
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { db, allRows, hash } from './cloud.mjs';
import { publishedCampus, snapshotHash, validateReleaseSnapshot } from '../web/server/release-validation';
import { hydrateModelEdits } from '../web/server/model-assets';
import { publicCampus } from './public-campus.mjs';
import { readPublishedCatalogue } from '../web/scripts/published-campus-catalogue.mjs';

const campus='campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a';
if(process.env.CAMPUS_ID!==campus)throw Error('UNILAG identity required');
const changes=JSON.parse(await fs.readFile('../data/unilag-enrichment/changes.json','utf8'));
const photos=JSON.parse(await fs.readFile('../data/unilag-enrichment/photos.json','utf8'));
const [previous,edits,published]=await Promise.all([allRows('source_features'),allRows('map_edits'),publishedCampus()]);
if(published.version!==changes.baselineVersion)throw Error('Published UNILAG changed; rebuild the patch against its current baseline.');
const expectedHash=snapshotHash(previous,edits);
if(process.env.EXPECTED_UNILAG_SNAPSHOT && expectedHash!==process.env.EXPECTED_UNILAG_SNAPSHOT)throw Error('Draft/source baseline changed since preparation; inspect a fresh preview.');
const records=structuredClone(previous),index=new Map(records.map(r=>[r.id,r]));
const meta=records.find(r=>r.entity==='meta');
// Acknowledge the published version while retaining every private source record
// and correction. This additive reconciliation does not replace the source graph.
meta.payload.version=published.version;
const hydrated=await hydrateModelEdits(edits);
const before=validateReleaseSnapshot({features:records,edits:hydrated},published);
const keptModels=[];
for(const change of changes.featureUpdates){
  const record=index.get('feature:'+change.id);if(!record)throw Error(`Source feature missing: ${change.id}`);
  const patch={...change.properties};
  const draft=edits.find(e=>e.kind==='building'&&e.id===change.id);
  if(patch.appearance && (record.payload.properties.appearance || draft?.properties.appearance || draft?.properties.modelDocumentAsset)){
    delete patch.appearance;keptModels.push(change.id);
  }
  Object.assign(record.payload.properties,patch);
}
for(const feature of changes.featureAdds){
  const id='feature:'+feature.properties.id;
  if(index.has(id))throw Error('Patch already applied or identity collision: '+id);
  const record={id,entity:'feature',source:feature.properties.source,payload:feature,hash:hash(feature)};
  records.push(record);index.set(id,record);
}
for(const place of changes.places){
  const id='place:'+place.id,old=index.get(id);
  if(old){
    // Only reviewed name/category/association fields change; retain owner access,
    // arrival guides, closures, hours and other independently authored details.
    Object.assign(old.payload,{name:place.name,category:place.category,aliases:[...new Set([...(old.payload.aliases||[]),...place.aliases])],...(place.buildingId?{buildingId:place.buildingId}:{}),...(place.sourceRefs?{sourceRefs:place.sourceRefs}:{})});
  }else{const record={id,entity:'place',source:place.source,payload:place,hash:hash(place)};records.push(record);index.set(id,record);}
}
meta.payload.sources=[...meta.payload.sources.filter((s:any)=>!changes.sources.some((n:any)=>n.id===s.id)),...changes.sources];
meta.payload.photos=[...(meta.payload.photos||[]),...photos.filter((p:any)=>!(meta.payload.photos||[]).some((old:any)=>old.id===p.id))];
for(const record of records)record.hash=hash(record.payload);
const data=validateReleaseSnapshot({features:records,edits:hydrated},published);
if(hash(data.graph)!==hash(before.graph))throw Error('Enrichment changed the effective routing graph.');
const road=data.map.features.filter(f=>f.properties?.source==='import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e');
if(road.length!==179 || new Set(road.map(f=>f.properties?.sourceId)).size!==179)throw Error('Road source accounting failed');
const oldCampus=process.env.CAMPUS_ID;process.env.CAMPUS_ID='lasu';
const lasuBefore={features:hash(await allRows('source_features')),edits:hash(await allRows('map_edits'))};process.env.CAMPUS_ID=oldCampus;
const id=randomUUID(),storagePath=`${campus}/${id}/detail-preparation.json`;
const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${storagePath}`,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({previous,edits,records,expectedHash,lasuBefore})});
if(!response.ok)throw Error('Could not preserve private rollback snapshot');
const report:any={expectedHash,storagePath,graphHash:hash(data.graph),routingUnchanged:true,keptModels,features:data.map.features.length,buildings:data.map.features.filter(f=>f.properties?.kind==='building').length,places:data.places.length,photos:data.photos?.length,lasuBefore};
await fs.mkdir('work',{recursive:true});
await fs.writeFile('work/unilag-preview.json',JSON.stringify(publicCampus(data)));
if(process.env.APPLY_UNILAG==='true'){
  if(!process.env.EXPECTED_UNILAG_SNAPSHOT)throw Error('Reviewed baseline hash required');
  const [owner]=await db('admin_users?select=id&limit=1');
  if(!owner)throw Error('Campus owner missing');
  // Transaction compares every source row and saves a rollback receipt. Existing
  // private drafts are not written, deleted, consumed or renumbered.
  report.reconciliationId=await db('rpc/reconcile_published_baseline','POST',{actor:owner.id,published_version:published.version,expected_sources:previous,records:records.map(({id,entity,source,payload,hash})=>({id,entity,source,payload,hash}))});
  if(hash(await allRows('map_edits'))!==hash(edits))throw Error('Drafts changed during preparation; pause publication and review.');
  process.env.CAMPUS_ID='lasu';const lasuAfter={features:hash(await allRows('source_features')),edits:hash(await allRows('map_edits'))};process.env.CAMPUS_ID=oldCampus;
  if(hash(lasuAfter)!==hash(lasuBefore))throw Error('LASU state changed during preparation; investigate before publication');
  const coverage=JSON.parse(await fs.readFile('../data/unilag-enrichment/coverage.json','utf8'));
  const sourceId='bd74d5cc-2b8d-4d42-977a-00165dc70b7e',importId='d1c63965-7cdb-4e79-8b49-ef04a5716c9d';
  const summary={layers:[{name:'Road width.geojson',format:'GeoJSON',count:179,geometryTypes:['Polygon'],crs:'EPSG:4326',suggestedRole:'road-surface',fields:[{name:'OBJECTID_1'},{name:'NAME'}]}],counts:{added:179,modified:0,removed:0,skipped:0},warnings:['Display surfaces only. Routing and access permissions unchanged.'],errors:[],duplicates:[],features:{type:'FeatureCollection',features:road},sampling:[{layer:'Road width.geojson',shown:179,total:179}],repairs:coverage.roads.repairs,totalFeatures:179};
  await db(`campus_imports?id=eq.${importId}`,'PATCH',{status:'reviewed',phase:'preview',message:'179 road surfaces accepted by guarded UNILAG reconciliation; source original and geometry diagnostics retained.',summary,snapshot_path:storagePath,updated_at:new Date().toISOString()});
  await db(`campus_sources?id=eq.${sourceId}`,'PATCH',{accepted_import_id:importId,updated_at:new Date().toISOString()});
  const catalogue=await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!);
  report.releaseId=await db('rpc/snapshot_release','POST',{catalogue_hash:catalogue.revision,release_summary:'UNILAG cartographic detail upgrade: 179 reviewed road surfaces, classified landscape, expanded destinations and attributed building photographs. Routing permissions and source conflicts remain explicitly recorded.'});
}
await fs.writeFile('work/unilag-preparation-receipt.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
