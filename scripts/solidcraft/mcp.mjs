import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** A dedicated stdio MCP session; never attaches to or resets an open desktop design. */
export async function connectSolidCraft(directory) {
  const child = spawn(
    'C:/Program Files/SolidCraft/solidcraft-cli.exe',
    ['mcp', '--headless', '--allow-path', directory, '--param-check', 'strict'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let serial = 0;
  const pending = new Map(),
    transcript = [],
    diagnostics = [];
  child.stderr.on('data', (bytes) => diagnostics.push(bytes.toString()));
  createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  child.on('error', rejectPending);
  child.on('exit', (code) =>
    rejectPending(
      new Error(
        `SolidCraft exited ${code}: ${diagnostics.join('').slice(-2000)}`,
      ),
    ),
  );
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `SolidCraft request timed out: ${method}; do not replay an uncertain mutation.`,
          ),
        );
        child.kill();
      }, 900000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      );
    });
  }
  const initialized = await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'turnright-solidcraft', version: '1.0.0' },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n',
  );
  async function call(name, args = {}) {
    const started = Date.now();
    let result = await request('tools/call', { name, arguments: args });
    // A running operation is polled, never submitted a second time.
    for (;;) {
      const message =
        result.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n') || '';
      let unfinished = false;
      try {
        unfinished = JSON.parse(message)?.done === false;
      } catch {
        /* A pending notice can be plain text. */
      }
      if (!message.startsWith('still running:') && !unfinished) break;
      result = await request('tools/call', { name: 'pending', arguments: {} });
    }
    const text =
      result.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n') || '';
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    transcript.push({
      name,
      arguments: args,
      elapsedMs: Date.now() - started,
      result: value,
      error: !!result.isError,
    });
    if (result.isError) throw new Error(`${name}: ${text}`);
    return { value, content: result.content };
  }
  return {
    call,
    transcript,
    diagnostics,
    server: initialized.serverInfo,
    listTools: () => request('tools/list', {}),
    close: () => {
      child.stdin.end();
      child.kill();
    },
  };
}
