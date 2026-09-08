import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assembleSources, applyEdits } from '../web/src/editor-model';
import { db } from './cloud.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(root,'web');
const id=process.env.RELEASE_ID,operation=process.env.RELEASE_OPERATION||'preview';
if(!id||!process.env.VERCEL_TOKEN||!process.env.VERCEL_PROJECT_ID||!process.env.VERCEL_ORG_ID)throw new Error('Release/Vercel workflow secrets are missing');
const vercel=(args:string[])=>execFileSync(process.execPath,[path.join(web,'node_modules/vercel/dist/index.js'),...args,'--token',process.env.VERCEL_TOKEN!],{cwd:web,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024}).trim();
const getDeployment=async(ref:string)=>{const response=await fetch(`https://api.vercel.com/v13/deployments/${ref}`,{headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`}});if(!response.ok)throw new Error('Unable to verify Vercel deployment');return response.json();};
try {
 const [release]=await db(`releases?id=eq.${encodeURIComponent(id)}`);
 if(!release)throw new Error('Release not found');
 if(operation==='preview'){
  if(release.status!=='queued')throw new Error('Only queued releases can be built');
  await db(`releases?id=eq.${id}`,'PATCH',{status:'building',error:null});
  const fallback=JSON.parse(await fs.readFile(path.join(root,'data/seed/campus.json'),'utf8'));
  if(!release.snapshot.features.length)throw new Error('No approved source baseline. Run bootstrap first.');
  const {data,errors}=applyEdits(assembleSources(release.snapshot.features,fallback),release.snapshot.edits);
  if(errors.length)throw new Error(errors.join('\n'));
  data.createdAt=new Date().toISOString();
  await fs.writeFile(path.join(root,'data/release-input.json'),JSON.stringify(data));
  execFileSync(process.execPath,[path.join(root,'scripts/package.mjs')],{cwd:root,env:{...process.env,CAMPUS_INPUT:'data/release-input.json',RELEASE_SUMMARY:release.summary},stdio:'inherit'});
  // Preserve the preceding immutable package URLs when promoting a new release.
  const previous=await db('releases?status=eq.published&order=published_at.desc&limit=1&select=deployment_url');
  if(previous[0]?.deployment_url){
   const origin=previous[0].deployment_url;
   const oldResponse=await fetch(`${origin}/packages/latest.json`);if(!oldResponse.ok)throw new Error('Previous release manifest unavailable; refusing to break existing offline downloads.');
   const old=await oldResponse.json();
   for(const asset of old.assets){
    if(!/^\/(packages|audio|glyphs)\//.test(asset.url)||asset.url.includes('..'))throw new Error('Invalid prior asset path');
    const target=path.join(web,'public',decodeURIComponent(asset.url));
    try{await fs.access(target);}catch{const response=await fetch(new URL(asset.url,origin));if(!response.ok)throw new Error('Previous release asset unavailable');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.from(await response.arrayBuffer()));}
   }
  }
  vercel(['pull','--yes','--environment=preview']);vercel(['build']);
  const output=vercel(['deploy','--prebuilt','--yes']);
  const url=output.split(/\s+/).findLast(s=>/^https:\/\/[\w.-]+\.vercel\.app$/.test(s));if(!url)throw new Error('Vercel did not return a deployment URL');
  const deployment=await getDeployment(new URL(url).hostname);if(deployment.readyState!=='READY')throw new Error(`Preview is not ready: ${deployment.readyState}`);
  const manifest=JSON.parse(await fs.readFile(path.join(web,'public/packages/latest.json'),'utf8'));
  await db(`releases?id=eq.${id}`,'PATCH',{status:'preview',preview_url:url,deployment_id:deployment.id,version:manifest.version});console.log(`Preview ready: ${url}`);
 }else if(operation==='publish'||operation==='rollback'){
  if(operation==='publish'&&release.status!=='preview')throw new Error('Review a ready preview first');
  if(operation==='rollback'&&release.status!=='published')throw new Error('Rollback requires a previously published release');
  if(!release.deployment_id)throw new Error('Deployment is missing');
  vercel(['promote',release.deployment_id,'--yes']);
  const deployment=await getDeployment(release.deployment_id);if(deployment.readyState!=='READY'||deployment.target!=='production')throw new Error('Production promotion could not be verified');
  await db(`releases?id=eq.${id}`,'PATCH',{status:'published',deployment_url:`https://${deployment.url}`,published_at:new Date().toISOString(),error:null});console.log('Production release verified.');
 }else throw new Error('Unknown release operation');
}catch(error){const message=(error as Error).message;await db(`releases?id=eq.${id}`,'PATCH',operation==='preview'?{status:'failed',error:message}:{error:message}).catch(()=>{});console.error(message);process.exitCode=1;}
