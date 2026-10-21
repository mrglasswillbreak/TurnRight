import { afterEach, vi } from 'vitest';
import { EditorWorkspace } from '../src/editor-workspace';
import type { MapEdit } from '../src/types';
import { registerDraftAndConflicts } from './editor-reliability-draft-and-conflicts';
import { registerConcurrentEdits } from './editor-reliability-concurrent-edits';
const feature = (): MapEdit => ({
  id: 'library',
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.201, 6.46] },
  properties: { name: 'Library', faculty: 'Science' },
  updated_at: '2026-09-14T01:00:00Z',
});
const workspace = (server: MapEdit[] = [feature()]) =>
  new EditorWorkspace(
    server,
    async (batch) =>
      batch.edits.map(({ edit }) => ({
        ...edit,
        updated_at: '2026-09-14T02:00:00Z',
      })),
    async () => {},
  );
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const fixture = () => ({ feature, workspace });
export type EditorReliabilityFixture = ReturnType<typeof fixture>;
registerDraftAndConflicts(fixture);
registerConcurrentEdits(fixture);
