/** Preserve both campus workspaces before layer migration. Artifacts contain receipts only. */
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { allRows, db, hash } from './cloud.mjs';
const sha=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
const receipts=[];
for(const campus of ['lasu','campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a']) {
  process.env.CAMPUS_ID=campus;
  const [features,edits,sources]=await Promise.all([allRows('source_features'),allRows('map_edits'),allRows('campus_sources')]);
  const snapshot=JSON.stringify({campus,features,edits,sources,capturedAt:new Date().toISOString()});
  const path=`${campus}/${randomUUID()}/layer-baseline.json`;
  const url=`${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${path}`;
  const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`};
  const saved=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:snapshot});
  if(!saved.ok) throw Error(`Baseline preservation failed: ${saved.status}`);
  const read=await fetch(url,{headers});
  if(!read.ok || sha(await read.text())!==sha(snapshot)) throw Error('Baseline read-back mismatch');
  const [release]=await db('releases?status=eq.published&order=created_at.desc&limit=1&select=id,version,snapshot');
  const accepted=new Map((release?.snapshot?.edits||[]).map((e:any)=>[`${e.kind}:${e.id}`,hash(e)]));
  const unpublished=edits.filter(e=>accepted.get(`${e.kind}:${e.id}`)!==hash(e));
  receipts.push({campus,path,sha256:sha(snapshot),features:features.length,edits:edits.length,sources:sources.length,publishedRelease:release?.id,publishedVersion:release?.version,unpublishedDraftCount:unpublished.length,unpublishedKinds:unpublished.reduce((counts:any,e:any)=>({...counts,[e.kind]:(counts[e.kind]||0)+1}),{}),workspaceHash:hash({features,edits})});
}
await fs.mkdir('work',{recursive:true});
await fs.writeFile('work/campus-layer-baselines.json',JSON.stringify(receipts,null,2));
console.log(JSON.stringify(receipts,null,2));
