import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from './cloud.mjs';
import { publicCampus } from './public-campus.mjs';

export async function prepareReleasePhotos(data, root) {
  const directory = path.join(root, 'data/release-photos');
  await fs.mkdir(directory, { recursive: true });
  for (const photo of data.photos || []) {
    if (!photo.id.startsWith('owner:')) continue;
    const id = photo.id.slice(6);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid private media reference');
    const [record] = await db(`building_media?id=eq.${id}&status=eq.approved`);
    const expected = publicCampus(photo, 'photos'), approved = publicCampus(record?.public_metadata || {}, 'photos');
    if (!record || Object.keys(expected).length !== Object.keys(approved).length || Object.entries(expected).some(([k, v]) => approved[k] !== v)) throw Error(`Photograph review changed: ${photo.id}`);
    if (!/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64}\.webp$/.test(record.derivative_path)) throw Error('Invalid derivative storage path');
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/building-media/${record.derivative_path}`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`Cannot read approved photograph ${photo.id}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== photo.bytes || bytes.length > 250 * 1024 || createHash('sha256').update(bytes).digest('hex') !== photo.sha256) throw Error(`Approved photograph failed integrity: ${photo.id}`);
    await fs.writeFile(path.join(directory, `${photo.sha256}.webp`), bytes);
  }
}
