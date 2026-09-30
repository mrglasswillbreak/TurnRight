/** One-time private transport for the supplied original. No key or raw attributes are logged. */
import fs from 'node:fs/promises';
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { db } from './cloud.mjs';
const campus='campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a',sourceId='bd74d5cc-2b8d-4d42-977a-00165dc70b7e',jobId='d1c63965-7cdb-4e79-8b49-ef04a5716c9d';
if(process.env.CAMPUS_ID!==campus)throw Error('Campus mismatch');
const configuration={layers:[{layer:'Road width.geojson',identity:'UNILAG Road width',role:'road-surface',idField:'OBJECTID_1',nameField:'NAME'}],refreshMode:'merge',attribution:'Owner-provided UNILAG road surfaces; original identities retained.',license:'Owner authorised public and offline publication in the UNILAG detail upgrade request, 30 September 2026. No broader reuse licence asserted.',redistributionConfirmed:true};
if(!(await db(`campus_sources?id=eq.${sourceId}`)).length)await db('campus_sources','POST',{id:sourceId,name:'UNILAG Road width',kind:'file',configuration});
if(!(await db(`campus_imports?id=eq.${jobId}`)).length)await db('campus_imports','POST',{id:jobId,source_id:sourceId,run_token:randomUUID(),configuration});
let [asset]=await db(`campus_import_assets?import_id=eq.${jobId}`);
if(!asset){
  const encrypted=await fs.readFile('../data/unilag-enrichment/original-road-width.enc');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.UNILAG_ROAD_SOURCE_KEY||'','base64'),encrypted.subarray(0,12));
  decipher.setAuthTag(encrypted.subarray(12,28));
  const original=gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(28)),decipher.final()]));
  const sha256=createHash('sha256').update(original).digest('hex');
  if(sha256!=='82659e26dcbeb4a8829b18fb14c2aa264bec6c877710147aac3ded1125d087b4')throw Error('Original source integrity failure');
  const path=`${campus}/${jobId}/${sha256}.json`;
  const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'};
  const url=`${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${path}`;
  const saved=await fetch(url,{method:'POST',headers,body:original});
  if(!saved.ok){const existing=await fetch(url,{headers});if(!existing.ok || createHash('sha256').update(Buffer.from(await existing.arrayBuffer())).digest('hex')!==sha256)throw Error('Private original upload failed');}
  asset=await db('rpc/add_import_asset','POST',{asset:{id:randomUUID(),import_id:jobId,path,name:'Road width.geojson.json',bytes:original.length,sha256}});
}
console.log(JSON.stringify({originalPreserved:true,sourceId,importId:jobId,sha256:asset.sha256,bytes:asset.bytes}));
