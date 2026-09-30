/** Campus-scoped production baseline audit. Private snapshots never become CI artifacts. */
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { db, allRows, hash } from './cloud.mjs';
import { publishedCampus, snapshotHash, validateReleaseSnapshot } from '../web/server/release-validation';
import { hydrateModelEdits } from '../web/server/model-assets';

if (process.env.CAMPUS_ID !== 'campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a') throw Error('UNILAG identity required');
const [features, edits, published] = await Promise.all([allRows('source_features'), allRows('map_edits'), publishedCampus()]);
const lasu = await (async () => { const current = process.env.CAMPUS_ID; process.env.CAMPUS_ID='lasu'; try { return {features:await allRows('source_features'),edits:await allRows('map_edits')}; } finally { process.env.CAMPUS_ID=current; } })();
const id = randomUUID();
const snapshot = { features, edits, publishedVersion:published.version, lasuHashes:{features:hash(lasu.features),edits:hash(lasu.edits)},capturedAt:new Date().toISOString() };
const storagePath=`${process.env.CAMPUS_ID}/${id}/baseline.json`;
const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${storagePath}`,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
if(!response.ok) throw Error(`Private baseline preservation failed: ${response.status}`);
let validation: string;
try { const data=validateReleaseSnapshot({features,edits:await hydrateModelEdits(edits)},published); validation=`Valid: ${data.map.features.length} features, ${data.places.length} places`; } catch(error) { validation=(error as Error).message; }
const report={storagePath,sourceCount:features.length,editCount:edits.length,snapshotHash:snapshotHash(features,edits),publishedVersion:published.version,baselineVersion:features.find(r=>r.entity==='meta')?.payload.version,editKinds:edits.reduce((r,e)=>({...r,[e.kind]:(r[e.kind]||0)+1}),{}),lasuHashes:snapshot.lasuHashes,validation};
console.log(JSON.stringify(report,null,2));
await fs.writeFile('work/unilag-baseline-receipt.json',JSON.stringify(report,null,2));
