import { afterEach, expect, it, vi } from 'vitest';
import { db } from '../server/backend';
import { publishedWorkspace } from '../server/published-workspace';
vi.mock('../server/backend', () => ({
  db: vi.fn(),
  HttpError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
afterEach(() => vi.resetAllMocks());
it('reads only the latest materialized corrections without expanding source snapshots', async () => {
  vi.mocked(db).mockResolvedValue([{ version: 'public', edits: [{ id: 'saved' }] }]);
  expect(await publishedWorkspace()).toEqual({ version: 'public', edits: [{ id: 'saved' }] });
  const path = vi.mocked(db).mock.calls[0][0];
  expect(path).toContain('edits:editor_edits');
  expect(path).toContain('limit=1');
  expect(path).not.toContain('snapshot');
});
it('never guesses empty corrections if migration backfill is unfinished', async () => {
  vi.mocked(db).mockResolvedValue([{ version: 'public', edits: null }]);
  await expect(publishedWorkspace()).rejects.toMatchObject({ status: 503 });
  vi.mocked(db).mockResolvedValue([]);
  expect(await publishedWorkspace()).toBeNull();
});
