import {
  privateHeaders,
  type RequestLike,
  type ResponseLike,
} from '../server/backend.js';

/** Liveness and deployed code identity only. No dependency or configuration disclosure. */
export default function handler(req: RequestLike, res: ResponseLike) {
  privateHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Use GET or HEAD.' });
    return;
  }
  const candidate =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  res.status(200).json({
    status: 'ok',
    revision: /^[a-f0-9]{40}$/i.test(candidate)
      ? candidate.toLowerCase()
      : 'unknown',
  });
}
