/** Reuse the existing attribution, synthetic-source guard and bounded photo codec. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { photoDerivative } from '../web/server/photo-processing';
import { validPhoto } from '../web/src/arrival';
import { requirePhotographicSource, syntheticPhotoEvidence } from './photo-source.mjs';
const root=path.resolve(import.meta.dirname,'..'), raw=path.join(root,'data/raw/unilag-upgrade');
const inventory=JSON.parse(await fs.readFile(path.join(raw,'commons-candidates.json'),'utf8'));
const prefix='import:4e362956-36db-49d4-884d-de4c7b933255:e5e49ffb:';
const selections: Record<string,[string,string]>={
  '59107718':['89','Senate House: entrance block and stepped tower'],
  '80012137':['89','Senate House: vertical facade screens'],
  '113535657':['96','Main Library: concrete roof canopy and vertical sunshades'],
  '59107716':['96','Main Library: entrance steps and facade'],
  '104875807':['96','Main Library: lower facade and library sign'],
  '113535613':['94','Akintunde Ojo Memorial Hall: glazed frontage'],
  '59106656':['87','Faculty of Arts: repeated framed window bays'],
  '113525024':['491','CITS: cream and red-brown exterior'],
  '113525160':['292','Afe Babalola Auditorium: glazed side elevation'],
  '199169521':['292','Afe Babalola Auditorium: entrance and pitched red roof'],
  '112833699':['26','Faculty of Education: side elevation'],
  '112833731':['26','Faculty of Education: open lower level and vertical fins'],
  '113464990':['99','Faculty of Engineering: courtyard and surrounding wings'],
  '112834242':['261','Faculty of Science: facade and sunshades'],
  '113535786':['524','Faculty of Management Sciences: named exterior'],
  '104875812':['270','King Jaja Hall: compound sign and residence wings'],
};
const clean=(s='')=>s.replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"').trim();
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const photos=[], decisions=[];
const destination=path.join(root,'data/photos');
const audit=JSON.parse(await fs.readFile(path.join(destination,'research/source-metadata-audit.json'),'utf8'));
for(const page of inventory.pages){
  const info=page.imageinfo?.[0], choice=selections[page.pageid], meta=info?.extmetadata||{};
  const identity={id:`commons:${page.pageid}`,title:page.title,sourceUrl:info?.descriptionurl,originalSha1:info?.sha1};
  if(!choice){decisions.push({...identity,status:syntheticPhotoEvidence(info)?'rejected-synthetic':'not-selected',reason:/unilag|university.of.lagos/i.test(page.title)?'No confident individual footprint match, interior/event view, or a redundant angle; retain as research only.':'Different institution, portrait, event or unrelated search result.'});continue;}
  requirePhotographicSource(page,page);
  if(clean(meta.LicenseShortName?.value)!=='CC BY-SA 4.0')throw Error(`Unreviewed licence ${page.title}`);
  const input=await fs.readFile(path.join(raw,'photo-review',`${page.pageid}.jpg`));
  const derivative=await photoDerivative(input);
  await fs.writeFile(path.join(destination,`${derivative.sha256}.webp`),derivative.bytes);
  const photo={id:identity.id,buildingId:prefix+choice[0],caption:choice[1],alt:choice[1],author:clean(meta.Artist?.value),sourceUrl:info.descriptionurl,license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:`${clean(meta.Artist?.value)} · ${page.title.replace(/^File:/,'')} · CC BY-SA 4.0`,modifications:'Resized and converted to metadata-free WebP. No scene content added.',capturedAt:clean(meta.DateTimeOriginal?.value).match(/\d{4}-\d{2}-\d{2}/)?.[0],checkedAt:'2026-09-30',historical:true,width:derivative.width,height:derivative.height,bytes:derivative.bytes.length,sha256:derivative.sha256,url:`/packages/photos/${derivative.sha256}.webp`};
  if(!validPhoto(photo))throw Error(`Photo validation failed ${page.title}`);
  photos.push(photo);decisions.push({...identity,status:'included',buildingId:photo.buildingId,reason:'Exterior and identity visually reviewed; dated view, current appearance may differ.',inputUrl:info.thumburl||info.url,inputSha256:sha(input),derivativeSha256:photo.sha256});
  if(!audit.pages.some((p:any)=>p.pageid===page.pageid))audit.pages.push(page);
}
const existing=JSON.parse(await fs.readFile(path.join(destination,'catalogue.json'),'utf8'));
await fs.writeFile(path.join(destination,'catalogue.json'),JSON.stringify([...existing.filter((p:any)=>!photos.some(n=>n.id===p.id)),...photos],null,2)+'\n');
await fs.writeFile(path.join(destination,'research/source-metadata-audit.json'),JSON.stringify(audit,null,2)+'\n');
await fs.writeFile(path.join(root,'data/unilag-enrichment/photos.json'),JSON.stringify(photos,null,2)+'\n');
await fs.writeFile(path.join(root,'data/unilag-enrichment/photo-review.json'),JSON.stringify({checkedAt:'2026-09-30',queries:['University of Lagos building','Unilag library','Unilag mosque','Unilag hall','Unilag medical','University of Lagos faculty','Unilag auditorium'],candidates:decisions},null,2)+'\n');
console.log(JSON.stringify({reviewed:decisions.length,photos:photos.length,buildings:new Set(photos.map(p=>p.buildingId)).size,bytes:photos.reduce((s,p)=>s+p.bytes,0)}));
