import { describe, expect, it, vi } from 'vitest';
import {
  publicationMode,
  publishReviewedRelease,
} from '../../scripts/release-publication.mjs';

const release = {
  id: 'release',
  status: 'preview',
  deployment_id: 'preview',
  review_id: 'review',
  version: 'campus-new',
  catalogue_revision: 'before',
  published_catalogue_revision: 'after',
};
const deployment = { id: 'production', url: 'production.vercel.app' };
function fixture(revisions = ['after', 'after', 'after']) {
  const events: string[] = [];
  const db = vi.fn(
    async (
      route: string,
      _method: string,
      body: Record<string, unknown>,
      prefer?: string,
      timeout?: number,
    ) => {
      events.push(route);
      if (route === 'rpc/gis_begin_publication') {
        expect(timeout).toBe(75000);
        return 'lease';
      }
      if (route === 'rpc/gis_complete_publication') {
        expect(timeout).toBe(75000);
        expect(body.lease_token).toBe('lease');
        return {
          id: release.id,
          status: 'published',
          version: release.version,
          deployment_id: deployment.id,
          deployment_url: `https://${deployment.url}`,
        };
      }
      if (route.startsWith('releases?')) expect(prefer).toBe('return=minimal');
      return null;
    },
  );
  const readCatalogue = vi.fn(async () => ({ revision: revisions.shift() }));
  const validateSnapshot = vi.fn(async () => {
    events.push('validate');
  });
  const verifyCurrent = vi.fn(async () => {
    events.push('verify');
    return deployment;
  });
  const promote = vi.fn(
    async (
      _id: string,
      options: { onCreated: (id: string) => Promise<void> },
    ) => {
      events.push('promote');
      await options.onCreated(deployment.id);
      return deployment;
    },
  );
  return {
    db,
    readCatalogue,
    validateSnapshot,
    verifyCurrent,
    promote,
    events,
  };
}
describe('publication completion recovery', () => {
  it('reconciles an already-live package with a fresh approval lease and no promotion', async () => {
    const api = fixture();
    await expect(publishReviewedRelease(release, api)).resolves.toEqual(
      deployment,
    );
    expect(api.promote).not.toHaveBeenCalled();
    expect(api.events).toEqual([
      'rpc/gis_begin_publication',
      'validate',
      'verify',
      'releases?id=eq.release',
      'rpc/gis_complete_publication',
      'rpc/gis_end_publication',
    ]);
  });
  it('publishes an unchanged baseline, saves the deployment receipt and checks the new catalogue', async () => {
    const api = fixture(['before', 'before', 'after']);
    await publishReviewedRelease(release, api);
    expect(api.verifyCurrent).not.toHaveBeenCalled();
    expect(api.events).toEqual([
      'rpc/gis_begin_publication',
      'validate',
      'promote',
      'releases?id=eq.release',
      'rpc/gis_complete_publication',
      'rpc/gis_end_publication',
    ]);
  });
  it('verifies a committed retry without duplicating audits or deployment actions', async () => {
    const api = fixture(['after', 'after']);
    await publishReviewedRelease({ ...release, status: 'published' }, api);
    expect(api.verifyCurrent).toHaveBeenCalledOnce();
    expect(api.db).not.toHaveBeenCalled();
    expect(api.promote).not.toHaveBeenCalled();
  });
  it.each(['unrelated', undefined])(
    'rejects catalogue drift before acquiring a lease (%s)',
    async (revision) => {
      const api = fixture([revision as string]);
      await expect(publishReviewedRelease(release, api)).rejects.toThrow(
        'directory changed',
      );
      expect(api.db).not.toHaveBeenCalled();
      expect(api.promote).not.toHaveBeenCalled();
    },
  );
  it('rejects stale approval before verification or publication', async () => {
    const api = fixture();
    api.db.mockRejectedValueOnce(Error('The approved snapshot is stale'));
    await expect(publishReviewedRelease(release, api)).rejects.toThrow('stale');
    expect(api.verifyCurrent).not.toHaveBeenCalled();
    expect(api.promote).not.toHaveBeenCalled();
  });
  it.each(['foreign deployment', 'approval timeout'])(
    'releases the lease after %s without claiming completion',
    async (message) => {
      const api = fixture();
      if (message === 'foreign deployment')
        api.verifyCurrent.mockRejectedValueOnce(Error(message));
      else
        api.db
          .mockImplementationOnce(async () => 'lease')
          .mockImplementationOnce(async () => null)
          .mockImplementationOnce(async () => {
            throw Error(message);
          });
      await expect(publishReviewedRelease(release, api)).rejects.toThrow(
        message,
      );
      expect(api.events.at(-1)).toBe('rpc/gis_end_publication');
      expect(api.promote).not.toHaveBeenCalled();
    },
  );
  it('rejects a concurrent campus change after verifying the deployment', async () => {
    const api = fixture(['after', 'after', 'another-campus']);
    await expect(publishReviewedRelease(release, api)).rejects.toThrow(
      'directory verification failed',
    );
    expect(api.events).not.toContain('rpc/gis_complete_publication');
    expect(api.events.at(-1)).toBe('rpc/gis_end_publication');
  });
  it('requires the approved review and expected package receipts', () => {
    expect(() =>
      publicationMode({ ...release, review_id: null }, 'before'),
    ).toThrow('reviewed preview');
    expect(() =>
      publicationMode(
        { ...release, published_catalogue_revision: null },
        'before',
      ),
    ).toThrow('reviewed preview');
    expect(() =>
      publicationMode({ ...release, status: 'failed' }, 'after'),
    ).toThrow('directory changed');
  });
});
