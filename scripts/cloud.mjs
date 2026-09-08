import { createHash } from 'node:crypto';
export async function db(route, method='GET', body, prefer='return=representation') {
 if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase job secrets are not configured');
 const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${route}`,{method,headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>null); if(!response.ok) throw new Error(data?.message||`Database request failed (${response.status})`); return data;
}
export async function allRows(table) { const all=[]; for(let offset=0;offset<30000;offset+=1000){const page=await db(`${table}?select=*&order=id&limit=1000&offset=${offset}`);all.push(...page);if(page.length<1000)return all;}throw new Error('Campus dataset exceeds expected bounds'); }
export function canonical(value) { if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!['createdAt','retrievedAt'].includes(k)).map(k=>[k,canonical(value[k])]));return value; }
export const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function flatten(data) {
 const records=[];
 const add=(entity,id,payload,source)=>records.push({id:`${entity}:${id}`,entity,source,payload,hash:hash(payload)});
 const {places,map,graph,...meta}=data; add('meta','campus',meta,'combined');
 places.forEach(p=>add('place',p.id,p,p.source));map.features.forEach(f=>add('feature',String(f.properties.id),f,f.properties.source||'campus'));
 graph.nodes.forEach(n=>add('node',n.id,n,'osm'));graph.edges.forEach(e=>add('edge',e.id,e,'osm'));
 return records;
}
export function compareSources(previous,candidate) {
 if(candidate.length<previous.length*.8)throw new Error('Import removed more than 20% of records. Retain the previous snapshot and inspect the source manually.');
 const old=new Map(previous.map(r=>[r.id,r])), next=new Map(candidate.map(r=>[r.id,r])), changes=[];
 for(const id of new Set([...old.keys(),...next.keys()])) {
  const before=old.get(id)||null,after=next.get(id)||null;
  if(before?.hash===after?.hash)continue;
  const kind=!before?'add':!after?'remove':'modify';
  changes.push({id:hash({id,before:before?.hash,after:after?.hash}),source_id:id,kind,before,after,base_hash:before?.hash||null,status:'pending',summary:`${kind}: ${after?.payload?.name||after?.payload?.properties?.name||before?.payload?.name||id}`});
 }
 return changes;
}
