import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { spawn, type ChildProcess } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { command } from '../../scripts/local/runtime.mjs';

vi.mock('node:child_process', { spy: true });

it('captures a fast command without sending it input', async () => {
  await expect(
    command(process.execPath, ['-e', 'process.stdout.write("ready")'], {
      capture: true,
    }),
  ).resolves.toBe('ready');
});

it('delivers the entire input and closes it for a reader', async () => {
  const input = 'local input\n'.repeat(20_000);
  await expect(
    command(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      capture: true,
      input,
    }),
  ).resolves.toBe(input);
});

it('reports child failure while redacting captured credentials', async () => {
  await expect(
    command(
      process.execPath,
      ['-e', 'process.stderr.write("sb_secret_example"); process.exit(7)'],
      { capture: true },
    ),
  ).rejects.toThrow('exited 7: [redacted]');
});

it.each([0, 7])(
  'handles a closed input pipe without an unhandled error (exit %i)',
  async (code) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: null,
      stderr: null,
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback(Object.assign(new Error('closed pipe'), { code: 'EPIPE' }));
          setImmediate(() => child.emit('close', code));
        },
      }),
    });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcess);
    await expect(
      command(process.execPath, [], { capture: true, input: 'required input' }),
    ).rejects.toThrow(
      code === 0 ? 'could not receive command input' : 'exited 7',
    );
  },
);
