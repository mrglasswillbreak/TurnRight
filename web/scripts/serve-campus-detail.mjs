/** Local review only: exposes private candidates on loopback, never publishes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
const root = path.resolve(
  process.argv[2] || 'work/campus-upgrade-20261017/campuses',
);
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const [variant, port] of [
  ['detail-preview', 5187],
  ['baseline', 5188],
]) {
  const responses = new Map(),
    campuses = [];
  for (const slug of ['lasu', 'unilag']) {
    const folder = path.join(root, slug),
      preview = path.join(folder, 'detail-preview');
    const data = JSON.parse(
      await fs.readFile(
        variant === 'baseline'
          ? path.join(folder, 'baseline.json')
          : path.join(preview, 'candidate.json'),
        'utf8',
      ),
    );
    const old = JSON.parse(
      await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'),
    );
    const identity = JSON.parse(
      await fs.readFile(path.join(folder, 'campus.json'), 'utf8'),
    );
    data.version = `${slug}-review-${hash(JSON.stringify(data)).slice(0, 12)}`;
    const dataUrl = `/packages/${slug}-review/campus.json`,
      body = Buffer.from(JSON.stringify(data));
    const core = {
      url: dataUrl,
      sha256: hash(body),
      bytes: body.length,
      contentType: 'application/json',
    };
    const textures = [
      ...(data.visuals?.textures || []),
      ...(data.visuals?.modelTextures || []),
    ];
    const assets = [
      ...new Map(
        [
          ...old.assets.filter(
            (a) =>
              a.url !== old.dataUrl &&
              !(old.visuals?.assetUrls || []).includes(a.url) &&
              !(old.textures?.assetUrls || []).includes(a.url),
          ),
          core,
          ...(data.visuals?.sectors || []),
          ...textures,
        ].map((a) => [a.url, a]),
      ).values(),
    ];
    const manifest = {
      ...old,
      version: data.version,
      dataUrl,
      assets,
      bytes: assets.reduce((n, a) => n + a.bytes, 0),
      visuals: {
        bytes: data.visuals?.bytes || 0,
        assetUrls: data.visuals?.sectors.map((s) => s.url) || [],
      },
      ...(textures.length
        ? {
            textures: {
              bytes: textures.reduce((n, a) => n + a.bytes, 0),
              assetUrls: textures.map((a) => a.url),
            },
          }
        : {}),
    };
    identity.manifestUrl = `/packages/${slug}-review/manifest.json`;
    campuses.push(identity);
    responses.set(dataUrl, body);
    responses.set(identity.manifestUrl, Buffer.from(JSON.stringify(manifest)));
    if (slug === 'lasu')
      responses.set(
        '/packages/latest.json',
        Buffer.from(JSON.stringify(manifest)),
      );
    if (variant !== 'baseline')
      for (const a of [...data.visuals.sectors, ...textures])
        responses.set(
          a.url,
          await fs.readFile(path.join(preview, path.basename(a.url))),
        );
  }
  responses.set(
    '/packages/campuses.json',
    Buffer.from(JSON.stringify({ schemaVersion: 1, campuses })),
  );
  http
    .createServer(async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405);
          res.end();
          return;
        }
        const url = new URL(req.url, `http://127.0.0.1:${port}`),
          local = responses.get(url.pathname);
        if (local) {
          res.setHeader(
            'Content-Type',
            url.pathname.endsWith('.json')
              ? 'application/json'
              : url.pathname.endsWith('.webp')
                ? 'image/webp'
                : 'application/octet-stream',
          );
          res.end(local);
          return;
        }
        const target = /^(\/packages\/|\/glyphs\/|\/audio\/)/.test(url.pathname)
          ? 'https://turnright.vercel.app'
          : 'http://127.0.0.1:5185';
        const response = await fetch(target + url.pathname + url.search, {
          signal: AbortSignal.timeout(25000),
        });
        res.statusCode = response.status;
        res.setHeader(
          'Content-Type',
          response.headers.get('content-type') || 'application/octet-stream',
        );
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(502);
        res.end('Local review resource unavailable');
      }
    })
    .listen(port, '127.0.0.1', () =>
      console.log(`${variant}: http://127.0.0.1:${port}`),
    );
}
