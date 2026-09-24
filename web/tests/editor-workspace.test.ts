import { describe, expect, it, vi } from 'vitest';
import {
  EditorWorkspace,
  type SaveBatch,
  type WorkspaceRecovery,
} from '../src/editor-workspace';
import type { MapEdit } from '../src/types';
import { applyEdits } from '../src/editor-model';
import { featureEdit } from '../src/editor-features';
import type { CampusData } from '../src/types';
import { campusFixture } from './fixture';
const edit = (name = 'Library'): MapEdit => ({
  id: 'library',
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.201, 6.46] },
  properties: { name },
});
const ack = (batch: SaveBatch, revision = '2026-09-11T12:00:00Z') =>
  batch.edits.map(({ edit }) => ({ ...edit, updated_at: revision }));
describe('editor autosave and recovery', () => {
  it('prepares an update with invalid drafts only when complete recovery is durable', async () => {
    let stored: WorkspaceRecovery | undefined;
    const send = vi.fn(async (batch: SaveBatch) => ack(batch));
    const workspace = new EditorWorkspace([], send, async (value) => {
      stored = structuredClone(value);
    });
    workspace.commit([
      { ...edit(), properties: { name: 'Library', heightMode: 'floors' } },
    ]);
    workspace.recoverModelInput('library', 'height', '');
    expect(await workspace.prepareUpdate()).toBe(true);
    expect(send).not.toHaveBeenCalled();
    const recovered = new EditorWorkspace([], send, async () => {}, stored);
    expect(recovered.edits).toEqual(workspace.edits);
    expect(recovered.past).toEqual(workspace.past);
    expect(recovered.modelInputs.library.height).toBe('');
    expect(await recovered.flush()).toBe(false);
    const unavailable = new EditorWorkspace([], send, async () => {
      throw new Error('disk full');
    });
    unavailable.recoverModelInput('library', 'height', '');
    expect(await unavailable.prepareUpdate()).toBe(false);
    expect(unavailable.status).toBe('Recovery unavailable');
  });
  it('identifies the feature blocking a shared save and retains the complete batch for repair', async () => {
    const send = vi.fn(async (batch: SaveBatch) => ack(batch));
    const workspace = new EditorWorkspace([], send, async () => {});
    const invalid: MapEdit = {
      id: 'theatre',
      kind: 'building',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2, 6.46],
            [3.201, 6.46],
            [3.201, 6.461],
            [3.2, 6.46],
          ],
        ],
      },
      properties: { name: 'Lecture theatre', heightMode: 'floors' },
    };
    workspace.commit([edit(), invalid]);
    expect(await workspace.flush()).toBe(false);
    expect(workspace.error).toBe(
      'Lecture theatre (building): Documented floor count must be between 1 and 50.',
    );
    expect(send).not.toHaveBeenCalled();
    expect(workspace.edits).toHaveLength(2);
    workspace.commit([
      { ...invalid, properties: { ...invalid.properties, floors: 2 } },
    ]);
    expect(await workspace.flush()).toBe(true);
    expect(send.mock.calls[0][0].edits).toHaveLength(2);
    expect(workspace.error).toBe('');
  });
  it('coalesces identical drawing snapshots and immediately preserves a committed edit', async () => {
    const persist = vi.fn(async () => {});
    const workspace = new EditorWorkspace(
      [],
      async (batch) => ack(batch),
      persist,
    );
    const draft = {
      ...edit(),
      kind: 'path' as const,
      geometry: { type: 'LineString' as const, coordinates: [[3.2, 6.46]] },
    };
    workspace.draft(draft);
    workspace.draft(structuredClone(draft));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    workspace.commit([edit()], null);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(workspace.edits).toHaveLength(1);
  });
  it('undoes a saved first correction without deleting the approved source place', async () => {
    const base = {
      ...campusFixture(),
      map: { type: 'FeatureCollection', features: [] },
      places: [
        {
          id: 'library',
          name: 'Approved library',
          coordinates: [3.201, 6.46],
          category: 'academic',
          aliases: [],
          source: 'test',
          sourceId: 'library',
        },
      ],
      graph: { nodes: [], edges: [] },
      closures: [],
    } as unknown as CampusData;
    const workspace = new EditorWorkspace(
      [],
      async (batch) => ack(batch),
      async () => {},
    );
    workspace.commit([edit('Correction')]);
    await workspace.flush();
    workspace.undo();
    await workspace.flush();
    const restored = applyEdits(base, workspace.saved).data;
    expect(restored.places[0].name).toBe('Approved library');
    expect(
      featureEdit(restored, 'place', 'library', workspace.saved)?.deleted,
    ).not.toBe(true);
    workspace.redo();
    expect(applyEdits(base, workspace.edits).data.places[0].name).toBe(
      'Correction',
    );
  });
  it('keeps server autosave available when browser recovery storage fails', async () => {
    const send = vi.fn(async (batch: SaveBatch) => ack(batch));
    const workspace = new EditorWorkspace([], send, async () => {
      throw new Error('Quota exceeded');
    });
    workspace.commit([edit()]);
    await vi.waitFor(() =>
      expect(workspace.status).toBe('Recovery unavailable'),
    );
    expect(workspace.canAutosave).toBe(true);
    expect(await workspace.flush()).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(workspace.status).toBe('Recovery unavailable');
    expect(workspace.dirty).toBe(false);
  });
  it('does not let a refresh replace a pending save', async () => {
    let finish!: (result: MapEdit[]) => void;
    let batch!: SaveBatch;
    const workspace = new EditorWorkspace(
      [],
      async (value) => {
        batch = value;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      async () => {},
    );
    workspace.commit([edit()]);
    const flight = workspace.flush();
    await vi.waitFor(() => expect(batch).toBeDefined());
    expect(() => workspace.reconcile([], true)).toThrow(
      'save is still running',
    );
    finish(ack(batch));
    expect(await flight).toBe(true);
    expect(workspace.saved[0].properties.name).toBe('Library');
  });
  it('saves commands as a batch and keeps newer local work while a request is in flight', async () => {
    let release!: (edits: MapEdit[]) => void;
    const send = vi
      .fn<(batch: SaveBatch) => Promise<MapEdit[]>>()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockImplementation(async (b) => ack(b, '2026-09-11T12:00:01Z'));
    const workspace = new EditorWorkspace([], send, async () => {});
    workspace.commit([edit('First')]);
    const flight = workspace.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    workspace.commit([edit('Second')]);
    expect(workspace.flush()).toBe(flight);
    release(ack(send.mock.calls[0][0]));
    expect(await flight).toBe(true);
    expect(workspace.edits[0].properties.name).toBe('Second');
    expect(send.mock.calls[1][0].edits[0].expectedUpdatedAt).toBe(
      '2026-09-11T12:00:00Z',
    );
    expect(workspace.status).toBe('Saved');
  });
  it('retries an uncertain response with the same operation ID after recovery', async () => {
    let recovery!: WorkspaceRecovery;
    const send = vi.fn(async (_b: SaveBatch): Promise<MapEdit[]> => {
      throw new Error('Connection lost');
    });
    const first = new EditorWorkspace([], send, async (value) => {
      recovery = value;
    });
    first.commit([edit()]);
    await first.flush();
    const operation = send.mock.calls[0][0];
    const replay = vi.fn(async (b: SaveBatch) => ack(b));
    const recovered = new EditorWorkspace(
      ack(operation),
      replay,
      async () => {},
      recovery,
    );
    expect(await recovered.flush()).toBe(true);
    expect(replay.mock.calls[0][0]).toEqual(operation);
    expect(recovered.edits).toEqual(ack(operation));
  });
  it('undoes a saved creation with a tombstone and can redo it', async () => {
    const send = vi.fn(async (b: SaveBatch) => ack(b));
    const workspace = new EditorWorkspace([], send, async () => {});
    workspace.commit([edit()]);
    await workspace.flush();
    workspace.undo();
    expect(workspace.edits[0].deleted).toBe(true);
    await workspace.flush();
    workspace.redo();
    expect(workspace.edits[0].deleted).not.toBe(true);
    expect(await workspace.flush()).toBe(true);
  });
  it('preserves a batch and local edits on a conflict until explicitly resolved', async () => {
    const send = vi.fn(async (_b: SaveBatch): Promise<MapEdit[]> => {
      throw Object.assign(new Error('Other session changed this draft'), {
        status: 409,
      });
    });
    const workspace = new EditorWorkspace([], send, async () => {});
    workspace.commit([edit()]);
    await workspace.flush();
    expect(workspace.status).toBe('Conflict');
    expect(await workspace.flush()).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    const server = [{ ...edit('Remote'), updated_at: '2026-09-11T13:00:00Z' }];
    expect(workspace.reconcile(server, true)).toBe(false);
    const review = workspace.reviewConflicts(server);
    expect(review.unresolved).toHaveLength(1);
    expect(
      workspace.reconcile(server, true, { [review.conflicts[0].key]: 'local' }),
    ).toBe(true);
    expect(workspace.edits[0].properties.name).toBe('Library');
    expect(workspace.saved[0].properties.name).toBe('Remote');
  });
  it('keeps unfinished and invalid geometry local', async () => {
    const send = vi.fn(async (b: SaveBatch) => ack(b));
    let recovery!: WorkspaceRecovery;
    const workspace = new EditorWorkspace([], send, async (value) => {
      recovery = value;
    });
    workspace.draft({
      id: 'path',
      kind: 'path',
      geometry: { type: 'LineString', coordinates: [[3.2, 6.46]] },
      properties: { name: 'Path' },
    });
    await workspace.flush();
    expect(send).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(recovery.unfinished?.id).toBe('path'));
    workspace.commit([
      { ...edit(), geometry: { type: 'Point', coordinates: [0, 0] } },
    ]);
    expect(await workspace.flush()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('detects a remote edit during reload without replacing the local draft', () => {
    const before = { ...edit('Before'), updated_at: '2026-09-11T12:00:00Z' };
    const recovery: WorkspaceRecovery = {
      saved: [before],
      edits: [edit('Local')],
      unfinished: null,
      pending: null,
      past: [],
      future: [],
    };
    const workspace = new EditorWorkspace(
      [{ ...edit('Remote'), updated_at: '2026-09-11T13:00:00Z' }],
      async (b) => ack(b),
      async () => {},
      recovery,
    );
    expect(workspace.status).toBe('Conflict');
    expect(workspace.edits[0].properties.name).toBe('Local');
  });
});
