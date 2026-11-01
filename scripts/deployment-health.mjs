import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

/** Allow propagation of temporary Vercel access without following any redirect. */
export async function verifyDeploymentHealth(origin, revision, headers) {
  const base = new URL(origin);
  assert(
    base.protocol === 'https:' && base.origin === origin,
    'Deployment health requires an HTTPS origin.',
  );
  const endpoint = new URL('/api/health', base).href;
  const deadline = Date.now() + 30000;
  let lastResponse = '';
  while (Date.now() < deadline) {
    let response;
    try {
      response = await fetch(endpoint, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
    } catch {
      // Fetch errors can contain request details; never propagate their payload.
      throw Error('Deployment health request failed.');
    }
    if (response.status === 200) {
      let health;
      try {
        health = await response.json();
      } catch {
        throw Error('Deployment health status 200 did not contain valid JSON.');
      }
      assert(
        isDeepStrictEqual(health, { status: 'ok', revision }),
        'Deployment health status 200 did not match the expected revision.',
      );
      assert(
        Date.now() < deadline,
        'Deployment health readiness deadline exceeded.',
      );
      return;
    }
    let target;
    try {
      const location = response.headers.get('location');
      if (location) target = new URL(location, endpoint);
    } catch {
      // An invalid Location is rejected without including its untrusted contents.
    }
    const destination =
      target && ['http:', 'https:'].includes(target.protocol)
        ? `${target.origin}${target.pathname}`
        : 'unavailable';
    lastResponse = `status ${response.status}${target ? `; target ${destination}` : ''}`;
    await response.body?.cancel().catch(() => {});
    if (
      response.status !== 302 ||
      target?.origin !== 'https://vercel.com' ||
      target.pathname !== '/sso-api' ||
      target.username ||
      target.password
    )
      throw Error(`Deployment health returned ${lastResponse}.`);
    // Retry the original endpoint with the same header, never the SSO target.
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, remaining)),
      );
  }
  throw Error(
    `Deployment health readiness deadline exceeded after 30000 ms (${lastResponse}).`,
  );
}
