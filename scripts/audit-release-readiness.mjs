import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { db } from './cloud.mjs';

// Read-only, bounded production inspection. Never export attribute values,
// complete geometries, authentication details or private source payloads.
const owners = await db('admin_users?select=id&limit=2');
if (owners.length !== 1) throw Error('Expected one original owner for the permission-checked audit.');
const actor = owners[0].id;
const identities = await db('campuses?select=id,slug&slug=in.(lasu,unilag)');
if (identities.length !== 2) throw Error('Both requested campus identities are required.');
const result = { recordedAt: new Date().toISOString(), revision: process.env.GITHUB_SHA, readOnly: true, campuses: [] };
for (const {id: campus, slug} of identities) {
  process.env.CAMPUS_ID = campus;
  const datasets = await db('rpc/gis_dataset_catalogue', 'POST', { actor });
  const quality = await db('rpc/gis_quality', 'POST', { actor });
  const record = { campus, slug, quality: quality.map(({feature_key, severity, code, message})=>({feature_key,severity,code,message})), datasets: [] };
  for (const dataset of datasets) {
    const counts = Object.fromEntries(dataset.schema.fields.map(field=>[field.name,{}]));
    const digest = createHash('sha256');
    let cursor, seen = 0;
    do {
      const page = await db('rpc/gis_query','POST',{actor,request:{datasetId:dataset.id,revision:dataset.revision,geometry:false,limit:200,...(cursor?{cursor}:{})}});
      for (const feature of page.features) {
        digest.update(JSON.stringify([feature.id,feature.properties]));
        for (const field of dataset.schema.fields) {
          const value=feature.properties[field.name];
          const type=value===null?'null':Array.isArray(value)?'array':typeof value;
          counts[field.name][type]=(counts[field.name][type]||0)+1;
        }
      }
      seen+=page.features.length;
      if(seen>300000 || (page.nextCursor && !page.features.length)) throw Error('Dataset audit exceeded bounds or cursor made no progress.');
      cursor=page.nextCursor;
    } while(cursor);
    record.datasets.push({id:dataset.id,name:dataset.name,revision:dataset.revision,included:dataset.included,rows:seen,attributesSha256:digest.digest('hex'),fields:dataset.schema.fields.map(field=>({name:field.name,type:field.type,required:!!field.required,public:!!field.public,observedTypes:counts[field.name]}))});
  }
  result.campuses.push(record);
  console.log(`${campus}: ${record.datasets.length} datasets inspected; ${quality.filter(issue=>issue.severity==='error').length} reported errors (quality list is bounded).`);
}
await mkdir('web/work/release-readiness',{recursive:true});
await writeFile('web/work/release-readiness/audit.json',JSON.stringify(result,null,2)+'\n');
