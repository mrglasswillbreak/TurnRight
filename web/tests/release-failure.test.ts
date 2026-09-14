import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node-only workflow module.
import { recordFailure } from '../../scripts/record-failure.mjs';

describe('release workflow failure reporting', () => {
  it('preserves the specific publication error saved by the release script', async () => {
    const database = vi
      .fn()
      .mockResolvedValue([
        { error: 'Vercel 422: Resource cannot be processed.' },
      ]);
    await recordFailure(
      { RELEASE_ID: 'release', RELEASE_OPERATION: 'publish' },
      database,
    );
    expect(database).toHaveBeenLastCalledWith(
      'releases?id=eq.release',
      'PATCH',
      {
        error: 'Vercel 422: Resource cannot be processed.',
      },
    );
  });

  it('records a fallback for setup failures without claiming production is unchanged', async () => {
    const database = vi.fn().mockResolvedValue([{ error: null }]);
    await recordFailure(
      { RELEASE_ID: 'release', RELEASE_OPERATION: 'publish' },
      database,
    );
    expect(database).toHaveBeenLastCalledWith(
      'releases?id=eq.release',
      'PATCH',
      {
        error:
          'Release workflow failed before completion. Check GitHub Actions and Vercel status before retrying.',
      },
    );
  });

  it('marks failed preview builds without overwriting their build error', async () => {
    const database = vi.fn().mockResolvedValue([{ error: 'Deployment ERROR' }]);
    await recordFailure(
      { RELEASE_ID: 'release', RELEASE_OPERATION: 'preview' },
      database,
    );
    expect(database).toHaveBeenLastCalledWith(
      'releases?id=eq.release',
      'PATCH',
      { status: 'failed', error: 'Deployment ERROR' },
    );
  });
});
