/** Verify the unchanged original in private storage before campus preparation. */
import { createHash } from 'node:crypto';
import { db } from './cloud.mjs';
const campus='campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a', sourceId='bd74d5cc-2b8d-4d42-977a-00165dc70b7e', importId='d1c63965-7cdb-4e79-8b49-ef04a5716c9d';
if(process.env.CAMPUS_ID!==campus)throw Error('Campus mismatch');
const [asset]=await db(`campus_import_assets?import_id=eq.${importId}`);
if(!asset)throw Error('Restore the original road-width upload through the private import workspace.');
const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${asset.path}`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}});
if(!response.ok)throw Error('Private original read-back failed');
const original=Buffer.from(await response.arrayBuffer()), sha256=createHash('sha256').update(original).digest('hex');
if(sha256!=='82659e26dcbeb4a8829b18fb14c2aa264bec6c877710147aac3ded1125d087b4' || original.length!==748261 || JSON.parse(original).features.length!==179)throw Error('Original integrity check failed');
console.log(JSON.stringify({originalPreserved:true,sourceId,importId,sha256,bytes:original.length}));
