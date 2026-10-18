import { describe, expect, it } from 'vitest';
import {
  isLocalPublishedOrigin,
  localDispatchConfiguration,
  validateLocalJob,
} from '../server/local-dispatch';

const id = '11111111-1111-4111-8111-111111111111';
const env = {
  TURNRIGHT_LOCAL_RUNTIME: '1',
  NODE_ENV: 'development',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  TURNRIGHT_LOCAL_DISPATCH_URL: 'http://127.0.0.1:5180/__local/jobs',
  TURNRIGHT_LOCAL_DISPATCH_TOKEN: 'a'.repeat(64),
};
describe('local worker transport', () => {
  it('allows the synthetic baseline only in the complete development environment', () => {
    expect(isLocalPublishedOrigin(new URL('http://127.0.0.1:5180'), env)).toBe(
      true,
    );
    expect(isLocalPublishedOrigin(new URL('http://127.0.0.1:5180'), {})).toBe(
      false,
    );
    expect(isLocalPublishedOrigin(new URL('http://example.org'), env)).toBe(
      false,
    );
    expect(() =>
      isLocalPublishedOrigin(new URL('http://127.0.0.1:5180'), {
        ...env,
        VERCEL: '1',
      }),
    ).toThrow('production');
  });
  it('is opt-in and fails closed when production variables are present', () => {
    expect(localDispatchConfiguration({})).toBeNull();
    expect(localDispatchConfiguration(env)).toEqual({
      url: env.TURNRIGHT_LOCAL_DISPATCH_URL,
      token: env.TURNRIGHT_LOCAL_DISPATCH_TOKEN,
    });
    for (const extra of [{ VERCEL: '1' }, { NODE_ENV: 'production' }])
      expect(() => localDispatchConfiguration({ ...env, ...extra })).toThrow(
        'production',
      );
  });
  it.each([
    { SUPABASE_URL: 'https://example.supabase.co' },
    { SUPABASE_URL: 'http://127.0.0.1:54322' },
    { TURNRIGHT_LOCAL_DISPATCH_URL: 'https://example.org/jobs' },
    {
      TURNRIGHT_LOCAL_DISPATCH_URL:
        'http://127.0.0.1:5180/__local/jobs?command=sh',
    },
    { TURNRIGHT_LOCAL_DISPATCH_TOKEN: '' },
    { SUPABASE_URL: '' },
    { TURNRIGHT_LOCAL_DISPATCH_URL: '' },
  ])('rejects a non-local or incomplete configuration: %j', (extra) => {
    expect(() => localDispatchConfiguration({ ...env, ...extra })).toThrow();
  });
  it('accepts only fixed workflows and their exact identity inputs', () => {
    expect(() =>
      validateLocalJob('gis-processing.yml', {
        campus_id: 'local-south',
        job_id: id,
      }),
    ).not.toThrow();
    for (const workflow of ['map-import.yml', 'source-review.yml'])
      expect(() =>
        validateLocalJob(workflow, {
          campus_id: 'lasu',
          [workflow === 'map-import.yml' ? 'import_id' : 'operation_id']: id,
          run_token: id,
        }),
      ).not.toThrow();
    for (const workflow of [
      'release.yml',
      'source-update.yml',
      '../../shell',
      'toString',
      '__proto__',
    ])
      expect(() => validateLocalJob(workflow, {})).toThrow('disabled');
    for (const inputs of [
      {},
      { campus_id: '../production', job_id: id },
      { campus_id: 'lasu', job_id: '$(sh)' },
      { campus_id: 'lasu', job_id: id, command: 'sh' },
    ])
      expect(() => validateLocalJob('gis-processing.yml', inputs)).toThrow();
    for (const inputs of [null, [], 42])
      expect(() =>
        validateLocalJob(
          'gis-processing.yml',
          inputs as unknown as Record<string, string>,
        ),
      ).toThrow('inputs');
  });
});
