import { describe, expect, it } from 'vitest';
import { adminEnvelope } from '../server/request-envelope';
import { bodyOf } from '../server/backend';
const request = (body: unknown) => ({ method: 'POST', headers: {}, body });
describe('administration envelope', () => {
  it('preserves default campus, payload and existing action contracts', () => {
    expect(adminEnvelope(request('{"action":"state"}'))).toEqual({
      action: 'state',
      payload: {},
      campus: 'lasu',
    });
    const body = {
      action: 'save-edits',
      payload: { edits: [] },
      campus: 'local-south',
    };
    expect(adminEnvelope(request(body))).toEqual(body);
  });
  it.each([
    [],
    1,
    true,
    '"text"',
    { action: null },
    { action: '' },
    { action: 'save_edits' },
    { action: 'a'.repeat(65) },
    { action: 'state', payload: null },
    { action: 'state', payload: [] },
    { action: 'state', campus: {} },
    { action: 'state', campus: '../other' },
  ])('rejects malformed envelopes: %j', (body) => {
    expect(() => adminEnvelope(request(body))).toThrow();
  });
  it('retains method, malformed JSON and size error statuses', () => {
    expect(() => bodyOf({ ...request({}), method: 'GET' })).toThrow(
      expect.objectContaining({ status: 405 }),
    );
    expect(() => bodyOf(request('{'))).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => bodyOf(request(null))).toThrow(
      expect.objectContaining({ status: 413 }),
    );
    expect(() => bodyOf(request({ large: 'x'.repeat(101) }), 100)).toThrow(
      expect.objectContaining({ status: 413 }),
    );
  });
});
