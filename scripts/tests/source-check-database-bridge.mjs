// Native PostgreSQL acceptance harness: Python owns the disposable SQL session;
// the actual production Node worker/comparator owns batching and run semantics.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { runSourceCheck } from "../source-check-worker.mjs";
const replies = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
let chain = Promise.resolve();
const db = (route, method, body) => {
  const task = chain.then(async () => {
    process.stdout.write(JSON.stringify({ route, method, body }) + "\n");
    const { value, done } = await replies.next();
    if (done) throw new Error("Database bridge closed");
    const response = JSON.parse(value);
    if (response.error) throw new Error(response.error);
    return response.result;
  });
  chain = task.catch(() => {});
  return task;
};
try {
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  const first = await runSourceCheck(input, db);
  const retry = await runSourceCheck(input, db);
  process.stdout.write(JSON.stringify({ finished: first, retry }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }) + "\n");
  process.exitCode = 1;
}
process.stdin.destroy();
