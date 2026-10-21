import { expect, it } from 'vitest';
import {
  createCipheriv,
  createHash,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
  constants,
} from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

it.each([16, 8])(
  'requires the complete 16-byte backup authentication tag (received %i)',
  async (tagLength) => {
    const folder = await mkdtemp(path.join(tmpdir(), 'turnright-backup-test-'));
    try {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const key = randomBytes(32),
        iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv, {
        authTagLength: 16,
      });
      const bytes = Buffer.concat([
        cipher.update(gzipSync('')),
        cipher.final(),
      ]);
      const receipt = {
        format: 1,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        wrappedKey: publicEncrypt(
          {
            key: publicKey,
            oaepHash: 'sha256',
            padding: constants.RSA_PKCS1_OAEP_PADDING,
          },
          key,
        ).toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().subarray(0, tagLength).toString('base64'),
        counts: {},
        storageObjects: 0,
        storageBytes: 0,
        scope: 'isolated empty test fixture',
      };
      await Promise.all([
        writeFile(path.join(folder, 'application-backup.enc'), bytes),
        writeFile(
          path.join(folder, 'backup-receipt.json'),
          JSON.stringify(receipt),
        ),
        writeFile(
          path.join(folder, 'backup-private.pem'),
          privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ),
      ]);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              '../../scripts/gis/verify-deployment-backup.mjs',
              import.meta.url,
            ),
          ),
          folder,
        ],
        { encoding: 'utf8', windowsHide: true },
      );
      if (tagLength === 16) {
        expect(result.status, result.stderr).toBe(0);
        const verified = JSON.parse(
          await readFile(path.join(folder, 'verification.json'), 'utf8'),
        );
        expect(verified.checks).toContain('AES-GCM authentication');
        expect(verified.sha256).toBe(receipt.sha256);
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/Invalid authentication tag length/);
        await expect(
          readFile(path.join(folder, 'verification.json')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
      expect(path.basename(folder)).toMatch(/^turnright-backup-test-/);
      await rm(folder, { recursive: true, force: true });
    }
  },
);
