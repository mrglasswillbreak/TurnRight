/** REA evidence stays in ignored work/, separate from import and production data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import net from 'node:net';
const run = promisify(execFile);
const evidence = path.resolve(
  process.argv[2] || 'work/campus-upgrade-20261017',
);
const rea = path.resolve('work/rea/node_modules/rea-agents/scripts/rea.mjs');
const installed = JSON.parse(
  await fs.readFile('work/rea/node_modules/rea-agents/package.json', 'utf8'),
);
if (installed.version !== '6.5.0')
  throw Error(
    'Install the pinned research tool: npm install --prefix work/rea --save-exact --ignore-scripts rea-agents@6.5.0',
  );
await fs.mkdir(evidence, { recursive: true });
for (const [name, url, actions] of [
  [
    'id-browser',
    'http://127.0.0.1:5186/#walkthrough=true',
    [
      {
        step_id: 'welcome',
        action: 'click',
        locator: { kind: 'role', role: 'button', name: 'OK' },
        timeout_ms: 30000,
      },
      {
        step_id: 'building-workflow',
        action: 'click',
        locator: { kind: 'css', selector: '.chapter-building' },
        timeout_ms: 10000,
      },
    ],
  ],
  [
    'turnright-browser',
    'http://127.0.0.1:5187/?campus=lasu',
    [
      {
        step_id: 'map',
        action: 'wait_for',
        locator: { kind: 'css', selector: '.map-canvas' },
        state: 'visible',
        timeout_ms: 30000,
      },
      {
        step_id: 'layers',
        action: 'click',
        locator: { kind: 'css', selector: '.visitor-layers summary' },
        timeout_ms: 10000,
      },
      {
        step_id: 'greenery',
        action: 'uncheck',
        locator: { kind: 'role', role: 'checkbox', name: 'Greenery' },
        timeout_ms: 10000,
      },
    ],
  ],
]) {
  // REA 6.5.0's sanitized launch environment fails on this Windows host. Attach
  // its unmodified provider to a browser owned by this bounded research runner.
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const browser = await chromium.launch({
    args: [
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
      '--use-angle=swiftshader',
      '--enable-webgl',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  const scenario = {
    browser: {
      mode: 'connect',
      cdp_endpoint: `http://127.0.0.1:${port}`,
      target_id: targetInfo.targetId,
    },
    start_url: { url },
    actions,
    capture: {
      after_each_step: ['dom', 'screenshot'],
      at_end: ['url', 'accessibility'],
      events: [],
      network: {
        request_body: false,
        response_body: false,
        header_values: false,
      },
    },
  };
  const input = path.join(evidence, `${name}-scenario.json`);
  await fs.writeFile(input, JSON.stringify(scenario, null, 2));
  try {
    const result = await run(
      process.execPath,
      [rea, 'capture-browser-scenario', input, '--format', 'json'],
      { maxBuffer: 100 * 1024 * 1024, timeout: 90000 },
    ).catch((error) => ({
      stdout: error.stdout || JSON.stringify({ error: error.message }),
    }));
    await fs.writeFile(
      path.join(evidence, `${name}-evidence.json`),
      result.stdout,
    );
    const value = JSON.parse(result.stdout);
    console.log(
      JSON.stringify({
        name,
        evidenceId: value.evidence_id,
        error: value.error || value.code,
      }),
    );
  } finally {
    await browser.close();
  }
}
