import { expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error Node-only deployment module.
import { uploadSource } from '../../scripts/vercel-api.mjs';

it('uploads the public reference catalogue with frozen assets while excluding raw and private data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'turnright-upload-test-'));
  const reference = JSON.stringify({ buildings: [{ id: 'public-reference' }] });
  const fixtures = {
    'data/building-evidence.json': reference,
    'data/photo-models/inventory.json': '{"buildings":[]}',
    'data/photo-models/private-review.json': 'private notes',
    'data/raw/private.json': 'raw import',
    'data/release-input.json': 'draft snapshot',
    '.env': 'private configuration',
    'web/src/.env': 'private configuration',
    'web/src/building-references.ts':
      "import evidence from '../../data/building-evidence.json';",
    'web/public/packages/lasu-abc123/campus.json': 'frozen campus',
    ...Object.fromEntries(
      [
        'package.json',
        'package-lock.json',
        'index.html',
        'vite.config.ts',
        'vitest.config.ts',
        'tsconfig.json',
        'tsconfig.functions.json',
        'vercel.json',
        'release-build.json',
      ].map((name) => [`web/${name}`, '{}']),
    ),
  };
  const uploads = new Map<string, Buffer>();
  vi.stubEnv('VERCEL_TOKEN', 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.origin).toBe('https://api.vercel.com');
      expect(url.pathname).toBe('/v2/files');
      const bytes = init.body as Buffer;
      const sha = createHash('sha1').update(bytes).digest('hex');
      expect(init.headers).toMatchObject({ 'x-vercel-digest': sha });
      uploads.set(sha, bytes);
      return Response.json({});
    }),
  );
  try {
    for (const [file, contents] of Object.entries(fixtures)) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const files = (await uploadSource(root)) as { file: string; sha: string }[];
    expect(
      files
        .filter((file) => file.file.startsWith('data/'))
        .map((file) => file.file),
    ).toEqual([
      'data/building-evidence.json',
      'data/photo-models/inventory.json',
    ]);
    expect(files.some((file) => file.file.includes('.env'))).toBe(false);
    expect(
      files.some(
        (file) => file.file === 'web/public/packages/lasu-abc123/campus.json',
      ),
    ).toBe(true);
    const catalogue = files.find(
      (file) => file.file === 'data/building-evidence.json',
    )!;
    expect(uploads.get(catalogue.sha)?.toString()).toBe(reference);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith('turnright-upload-test-')
    )
      console.error('Skipped cleanup of an unexpected test directory');
    else await rm(root, { recursive: true });
  }
});
