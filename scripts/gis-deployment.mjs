import fs from 'node:fs/promises';
import {createWriteStream, createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!secret)throw Error('Deployment credentials are missing');
const headers={apikey:secret,Authorization:'Bearer '+secret};
const out=path.join(root,'web/work/gis-deployment');await fs.mkdir(out,{recursive:true});
const mode=process.env.GIS_DEPLOYMENT_MODE;
async function request(route,options={}){const r=await fetch(base+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Deployment request failed '+r.status+' at '+route.split('?')[0]);return r;}
if(mode==='migrate'){
  const names=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(n=>/^(02[3-9]|03[0-7])_/.test(n)).sort();
  const bundle=await Promise.all(names.map(async name=>({name,sql:await fs.readFile(path.join(root,'supabase/migrations',name),'utf8')})));
  const receipt=await (await request('/rest/v1/rpc/turnright_apply_gis_20261005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_bundle:bundle})})).json();
  await fs.writeFile(path.join(out,'migration-receipt.json'),JSON.stringify(receipt,null,2));console.log('Applied verified GIS migrations; receipt saved.');
}else if(mode==='backup'){
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),gzip=createGzip({level:6});
  const destination=path.join(out,'application-backup.enc');const finished=pipeline(gzip,cipher,createWriteStream(destination,{flags:'wx'}));
  const counts={},objects=[];let totalBytes=0;
  async function append(record){const bytes=JSON.stringify(record)+'\n';totalBytes+=Buffer.byteLength(bytes);if(totalBytes>4*1024**3)throw Error('Backup exceeded the 4 GiB safety bound');if(!gzip.write(bytes))await once(gzip,'drain');}
  try{
    await append({kind:'metadata',format:1,createdAt:new Date().toISOString(),scope:'Public application tables and private storage objects; platform Auth is outside this backup'});
    const schema=await (await request('/rest/v1/')).json();
    const tables=Object.keys(schema.paths).filter(p=>/^\/[a-z_][a-z0-9_]*$/.test(p)&&p!=='/'&&p!=='/spatial_ref_sys').map(p=>p.slice(1)).sort();
    for(const table of tables){const pageSize=['baseline_reconciliations','releases','campus_imports','model_assets'].includes(table)?1:table==='map_edits'?10:100;let count=0;for(let offset=0;;offset+=pageSize){const rows=await (await request('/rest/v1/'+table+'?select=*&limit='+pageSize+'&offset='+offset)).json();if(!Array.isArray(rows))throw Error('Invalid backup table response');await append({kind:'rows',table,offset,rows});count+=rows.length;if(rows.length<pageSize)break;}counts[table]=count;console.log('Backed up table '+table+': '+count+' rows');}
    const buckets=await (await request('/storage/v1/bucket')).json();
    for(const bucket of buckets.filter(b=>!b.public)){
      const prefixes=[''];for(let k=0;k<prefixes.length;k++){const prefix=prefixes[k];for(let offset=0;;offset+=100){const entries=await (await request('/storage/v1/object/list/'+encodeURIComponent(bucket.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})})).json();for(const item of entries){const name=prefix?prefix+'/'+item.name:item.name;if(!item.id){prefixes.push(name);continue;}const content=Buffer.from(await (await request('/storage/v1/object/'+encodeURIComponent(bucket.id)+'/'+name.split('/').map(encodeURIComponent).join('/'))).arrayBuffer());const sha256=createHash('sha256').update(content).digest('hex');await append({kind:'object',bucket:bucket.id,name,metadata:item.metadata,sha256,data:content.toString('base64')});objects.push({bucket:bucket.id,bytes:content.length,sha256});}if(entries.length<100)break;}}
      console.log('Backed up private bucket '+bucket.id);
    }
    await append({kind:'receipt',counts,objects:objects.length});gzip.end();await finished;
    const digest=createHash('sha256');for await(const chunk of createReadStream(destination))digest.update(chunk);
    const publicKey=await fs.readFile(path.join(root,'scripts/gis/deployment-backup-public.pem'));
    const receipt={format:1,algorithm:'RSA-OAEP-SHA256 + AES-256-GCM + gzip',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),wrappedKey:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),sha256:digest.digest('hex'),counts,storageObjects:objects.length,storageBytes:objects.reduce((n,o)=>n+o.bytes,0),scope:'Public application tables and private storage; Supabase Auth and platform configuration are not included'};
    await fs.writeFile(path.join(out,'backup-receipt.json'),JSON.stringify(receipt,null,2));console.log('Encrypted application backup complete.');
  }catch(error){gzip.destroy(error);await finished.catch(()=>{});throw error;}
}else throw Error('Use GIS_DEPLOYMENT_MODE=backup or migrate');
