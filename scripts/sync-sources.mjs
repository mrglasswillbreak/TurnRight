import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { allRows, compareSources, db, flatten } from './cloud.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let jobId=process.env.JOB_ID;
try {
 if(!jobId){const [job]=await db('jobs','POST',{kind:'import',status:'running'});jobId=job.id;}else await db(`jobs?id=eq.${jobId}`,'PATCH',{status:'running'});
 const bootstrap=process.argv.includes('--bootstrap');
 const data=JSON.parse(await fs.readFile(path.join(root,bootstrap?'data/seed/campus.json':'data/candidates/campus.json'),'utf8'));
 const candidate=flatten(data),previous=await allRows('source_features');
 if(bootstrap){if(previous.length)throw new Error('Sources already initialized; bootstrap cannot overwrite them.');for(let i=0;i<candidate.length;i+=200)await db('source_features','POST',candidate.slice(i,i+200));}
 else {
  if(!previous.length)throw new Error('Run the documented one-time bootstrap before source checks.');
  const changes=compareSources(previous,candidate);
  // Suppress identical rejected decisions, but replace obsolete pending proposals.
  const known=await allRows('map_changes'), knownIds=new Set(known.map(c=>c.id)), newIds=new Set(changes.map(c=>c.id));
  for(const obsolete of known.filter(c=>c.status==='pending'&&!newIds.has(c.id)))await db(`map_changes?id=eq.${obsolete.id}`,'PATCH',{status:'superseded'});
  const fresh=changes.filter(c=>!knownIds.has(c.id));for(let i=0;i<fresh.length;i+=100)await db('map_changes','POST',fresh.slice(i,i+100));
 }
 await db(`jobs?id=eq.${jobId}`,'PATCH',{status:'succeeded',message:bootstrap?'Approved source baseline initialized.':'Source check complete. Proposed changes await review.',completed_at:new Date().toISOString()});
 console.log(bootstrap?'Source baseline initialized.':'Source changes queued for review.');
}catch(error){if(jobId)await db(`jobs?id=eq.${jobId}`,'PATCH',{status:'failed',message:error.message,completed_at:new Date().toISOString()}).catch(()=>{});console.error(error.message);process.exitCode=1;}
