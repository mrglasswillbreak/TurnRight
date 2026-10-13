import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { createHash, randomBytes, createCipheriv, publicEncrypt, generateKeyPairSync, constants } from 'node:crypto';
import { verifyDeploymentBackup } from '../gis/verify-deployment-backup.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
test('encrypted backup readback verifies recovery keys, identities, contents and tampering', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'turnright-backup-test-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert(path.basename(directory).startsWith('turnright-backup-test-'));
    await fs.rm(directory, { recursive: true });
  });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = randomBytes(32), iv = randomBytes(12), bytes = Buffer.from('private test image');
  const records = [
    { kind: 'rows', table: 'source_features', rows: [{ campus_id: 'a', id: 'path:1' }, { campus_id: 'b', id: 'path:1' }] },
    { kind: 'object', data: bytes.toString('base64'), sha256: sha(bytes) },
  ];
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(gzipSync(records.map(x => JSON.stringify(x)).join('\n') + '\n')), cipher.final()]);
  const receipt = {
    format: 1, sha256: sha(encrypted), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    wrappedKey: publicEncrypt({ key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'),
    counts: { source_features: 2 }, storageObjects: 1, storageBytes: bytes.length, scope: 'test fixture',
  };
  const writeReceipt = () => fs.writeFile(path.join(directory, 'backup-receipt.json'), JSON.stringify(receipt));
  await fs.writeFile(path.join(directory, 'application-backup.enc'), encrypted);
  await fs.writeFile(path.join(directory, 'backup-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await writeReceipt();
  const runner = await verifyDeploymentBackup(directory, key);
  const local = await verifyDeploymentBackup(directory);
  assert.equal(runner.recoveryKeySha256, local.recoveryKeySha256);
  assert.equal(local.recoveryKeySha256, sha(key));
  assert.equal(local.storageObjects, 1);
  assert(local.checks.includes('RSA key unwrap'));
  assert(!runner.checks.includes('RSA key unwrap'));
  receipt.counts.source_features = 3;
  await writeReceipt();
  await assert.rejects(verifyDeploymentBackup(directory, key));
  receipt.counts.source_features = 2;
  receipt.tag = Buffer.alloc(16).toString('base64');
  await writeReceipt();
  await assert.rejects(verifyDeploymentBackup(directory, key));
  encrypted[0] ^= 1;
  await fs.writeFile(path.join(directory, 'application-backup.enc'), encrypted);
  await assert.rejects(verifyDeploymentBackup(directory, key), /Encrypted backup hash/);
});
