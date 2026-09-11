import { describe, expect, it, vi } from 'vitest';
import {
  EditorWorkspace,
  type SaveBatch,
  type WorkspaceRecovery,
} from '../src/editor-workspace';
import type { MapEdit } from '../src/types';
const edit = (name = 'Library'): MapEdit => ({
  id: 'library',
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.201, 6.46] },
  properties: { name },
});
const ack = (batch: SaveBatch, revision = '2026-09-11T12:00:00Z') =>
  batch.edits.map(({ edit }) => ({ ...edit, updated_at: revision }));
describe('editor autosave and recovery', () => {
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
    workspace.reconcile(
      [{ ...edit('Remote'), updated_at: '2026-09-11T13:00:00Z' }],
      true,
    );
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
