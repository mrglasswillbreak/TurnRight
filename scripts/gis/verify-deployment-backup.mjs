import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, privateDecrypt, constants, createDecipheriv } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import assert from 'node:assert/strict';

// Extract the encrypted artifact alongside its separately retained private key.
// Verification streams plaintext in memory and never writes decrypted records.
const directory = process.argv[2];
if (!directory) throw Error('Usage: node scripts/gis/verify-deployment-backup.mjs <private-backup-directory>');
const file = (name) => path.join(directory, name);
const receipt = JSON.parse(await fs.readFile(file('backup-receipt.json'), 'utf8'));
assert.equal(receipt.format, 1);
const hash = createHash('sha256');
for await (const chunk of createReadStream(file('application-backup.enc'))) hash.update(chunk);
assert.equal(hash.digest('hex'), receipt.sha256, 'Encrypted backup hash');
const key = privateDecrypt({
  key: await fs.readFile(file('backup-private.pem')),
  oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING,
}, Buffer.from(receipt.wrappedKey, 'base64'));
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(receipt.iv, 'base64'));
decipher.setAuthTag(Buffer.from(receipt.tag, 'base64'));
const unzip = createGunzip();
const finished = pipeline(createReadStream(file('application-backup.enc')), decipher, unzip);
// Observe pipeline rejection immediately while the record reader is active.
void finished.catch(() => {});
const counts = {}, identities = {};
let objects = 0, storageBytes = 0;
for await (const line of createInterface({ input: unzip, crlfDelay: Infinity })) {
  const record = JSON.parse(line);
  if (record.kind === 'rows') {
    counts[record.table] = (counts[record.table] || 0) + record.rows.length;
    identities[record.table] ??= new Set();
    for (const row of record.rows) if (row.id) {
      // Feature IDs are campus scoped, including in the legacy tables.
      const identity = JSON.stringify([row.campus_id, row.kind, row.id]);
      assert(!identities[record.table].has(identity), 'Duplicate backup identity in ' + record.table);
      identities[record.table].add(identity);
    }
  }
  if (record.kind === 'object') {
    const bytes = Buffer.from(record.data, 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, 'Storage object hash');
    objects++; storageBytes += bytes.length;
  }
}
await finished;
assert.deepEqual(counts, receipt.counts);
assert.equal(objects, receipt.storageObjects);
assert.equal(storageBytes, receipt.storageBytes);
const verification = {
  verifiedAt: new Date().toISOString(), sha256: receipt.sha256,
  counts, storageObjects: objects, storageBytes,
  checks: ['ciphertext SHA-256', 'RSA key unwrap', 'AES-GCM authentication', 'gzip records', 'row counts and identities', 'storage content hashes'],
  scope: receipt.scope,
};
await fs.writeFile(file('verification.json'), JSON.stringify(verification, null, 2));
console.log(JSON.stringify(verification, null, 2));
