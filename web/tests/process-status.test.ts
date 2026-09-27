import { afterEach, expect, it, vi } from 'vitest';
import { db } from '../server/backend';
import { processStatus } from '../server/process-status';
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

it('returns older active work and terminal watched work outside recent history without duplicating rows', async () => {
  const id = '11111111-1111-1111-1111-111111111111';
  vi.mocked(db).mockImplementation(async (path) => {
    if (!path.startsWith('jobs?')) return [] as never;
    return (
      path.includes('&or=')
        ? [
            { id: 'older-running', status: 'running' },
            { id, status: 'succeeded' },
            { id: 'recent' },
          ]
        : [{ id: 'recent' }]
    ) as never;
  });
  const result = await processStatus({ jobs: [id] });
  expect(result.jobs).toHaveLength(3);
  expect(result.jobs).toContainEqual({ id, status: 'succeeded' });
  expect(
    vi.mocked(db).mock.calls.some(([path]) => path.includes(`id.in.(${id})`)),
  ).toBe(true);
  expect(
    vi.mocked(db).mock.calls.every(([path]) => !path.includes('select=*')),
  ).toBe(true);
});
it('rejects query injection and excessive watched IDs', async () => {
  vi.mocked(db).mockResolvedValue([]);
  await expect(
    processStatus({ jobs: ['bad),campus_id.eq.other'] }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    processStatus({
      jobs: Array(1001).fill('11111111-1111-1111-1111-111111111111'),
    }),
  ).rejects.toMatchObject({ status: 400 });
});
