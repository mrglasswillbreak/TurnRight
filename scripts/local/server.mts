import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer as createViteServer } from "../../web/node_modules/vite/dist/node/index.js";
import { root, runtime, origin, readConfig, requireDevelopmentHost } from "./runtime.mjs";
import { validateLocalJob } from "../../web/server/local-dispatch.ts";
import type { RequestLike, ResponseLike } from "../../web/server/backend.ts";

requireDevelopmentHost();
const config = await readConfig();
if (process.env.SUPABASE_URL !== config.API_URL || process.env.PUBLISHED_MAP_URL !== origin)
  throw Error("Start the development server through npm run local:up.");
const { default: admin } = await import("../../web/api/admin.ts");
const { default: reports } = await import("../../web/api/reports.ts");
const { default: health } = await import("../../web/api/health.ts");
const { db } = await import("../../web/server/backend.ts");
const { withCampusId } = await import("../../web/server/campus-scope.ts");
await mkdir(path.join(runtime, "jobs"), { recursive: true });
await mkdir(path.join(runtime, "tmp"), { recursive: true });
const vite = await createViteServer({
  root: path.join(root, "web"),
  envDir: runtime,
  mode: "development",
  server: {
    middlewareMode: true,
    host: "127.0.0.1",
    hmr: { host: "127.0.0.1" },
    fs: {
      allow: [path.join(root, "web"), path.join(root, "scripts")],
      deny: [
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem}",
        "**/.git/**",
        // Match our private scratch folder, not GitHub's /home/runner/work checkout.
        path.join(root, "web/work/**").replaceAll("\\", "/"),
        "**/.local-runtime/**",
        "**/supabase/.temp/**",
      ],
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(config.API_URL),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(config.ANON_KEY),
    "import.meta.env.VITE_LOCAL_DEVELOPMENT": JSON.stringify("true"),
  },
});
const pending: Array<{ workflow: string; inputs: Record<string, string> }> = [];
const active = new Map<string, ChildProcess>();
const queued = new Set<string>();
let stopping = false;
const keyOf = (job: (typeof pending)[number]) =>
  `${job.workflow}:${job.inputs.job_id || job.inputs.import_id || job.inputs.operation_id}`;
function runNext() {
  if (stopping || active.size || !pending.length) return;
  const job = pending.shift()!;
  const key = keyOf(job);
  const env = {
    ...process.env,
    CAMPUS_ID: job.inputs.campus_id,
    TMPDIR: path.join(runtime, "tmp"),
  };
  let binary = process.execPath;
  let args: string[];
  if (job.workflow === "gis-processing.yml") {
    Object.assign(env, { GIS_JOB_ID: job.inputs.job_id });
    args = ["scripts/gis-worker.mjs"];
  } else if (job.workflow === "map-import.yml") {
    Object.assign(env, {
      IMPORT_ID: job.inputs.import_id,
      RUN_TOKEN: job.inputs.run_token,
    });
    binary = "python3";
    args = ["scripts/import_map.py"];
  } else {
    Object.assign(env, {
      SOURCE_REVIEW_OPERATION_ID: job.inputs.operation_id,
      SOURCE_REVIEW_RUN_TOKEN: job.inputs.run_token,
    });
    args = ["scripts/source-review-worker.mjs"];
  }
  const log = createWriteStream(path.join(runtime, "jobs", `${key.replace(":", "-")}.log`), {
    flags: "a",
    mode: 0o600,
  });
  const child = spawn(binary, args, {
    cwd: root,
    env,
    windowsHide: true,
    timeout: 25 * 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  active.set(key, child);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("error", () =>
    console.error("Local worker could not start. See the private local job log."),
  );
  child.on("close", (code) => {
    log.end();
    active.delete(key);
    queued.delete(key);
    console.log(
      JSON.stringify({
        event: "local-worker-completed",
        workflow: job.workflow,
        code,
      }),
    );
    runNext();
  });
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3_000_000) throw Error("Request body exceeds the local API limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function internalToken(req: IncomingMessage) {
  const expected = Buffer.from(`Bearer ${config.dispatchToken}`);
  const supplied = Buffer.from(req.headers.authorization || "");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function enqueue(value: unknown) {
  if (stopping) throw Error("The local dispatcher is stopping.");
  const job = value as { workflow: string; inputs: Record<string, string> };
  if (!job || typeof job.workflow !== "string" || !job.inputs || typeof job.inputs !== "object")
    throw Error("Invalid job request.");
  validateLocalJob(job.workflow, job.inputs);
  if (queued.has(keyOf(job))) return;
  if (pending.length >= 16) throw Error("The local job queue is full.");
  if (job.workflow === "map-import.yml") {
    await withCampusId(job.inputs.campus_id, async () => {
      const jobs = await db<{ source_id: string }[]>(
        `campus_imports?id=eq.${job.inputs.import_id}&campus_id=eq.${job.inputs.campus_id}&select=source_id`,
      );
      const sources = jobs.length
        ? await db<{ kind: string }[]>(
            `campus_sources?id=eq.${jobs[0].source_id}&campus_id=eq.${job.inputs.campus_id}&select=kind`,
          )
        : [];
      if (sources[0]?.kind !== "file")
        throw Error("Only uploaded file sources are enabled locally.");
      // New hosted sources deliberately start in shadow mode. Local uploads
      // have no remote provider; enable proposal generation only in this
      // loopback sandbox. Acceptance and publication guards remain separate.
      await db(
        "source_check_policy?on_conflict=campus_id,source_key",
        "POST",
        {
          campus_id: job.inputs.campus_id,
          source_key: "import:" + jobs[0].source_id,
          enabled: true,
        },
        "resolution=merge-duplicates,return=minimal",
      );
    });
  }
  queued.add(keyOf(job));
  pending.push(job);
  runNext();
}
const server = createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== "127.0.0.1:5180" ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      json(res, 403, { error: "Use the local loopback origin." });
      return;
    }
    const url = new URL(req.url || "/", origin);
    if (url.pathname.startsWith("/__local/")) {
      if (req.method !== "POST" || !internalToken(req)) {
        json(res, 403, { error: "Local control authentication required." });
        return;
      }
      if (url.pathname === "/__local/jobs") {
        await enqueue(JSON.parse(await body(req)));
        json(res, 202, { accepted: true });
        return;
      }
      if (url.pathname === "/__local/stop") {
        json(res, 200, { stopped: true });
        await stop();
        return;
      }
      json(res, 404, { error: "Unknown local control." });
      return;
    }
    if (["/api/admin", "/api/reports", "/api/health"].includes(url.pathname)) {
      const payload = await body(req);
      if (url.pathname === "/api/admin") {
        const value = JSON.parse(payload || "{}");
        if (
          /^(check-sources|refresh-source|source-schedule|source-updates-check|source-updates-reverify|prepare-release|publish-release|rollback)$/.test(
            value.action || "",
          ) ||
          (value.action === "import-start" && value.payload?.kind && value.payload.kind !== "file")
        ) {
          json(res, 409, {
            error:
              "External downloads and cloud publication are disabled in the local editor. Use uploaded files and local review; see the local development guide.",
          });
          return;
        }
      }
      let status = 200;
      const response: ResponseLike = {
        status(code) {
          status = code;
          return response;
        },
        setHeader(name, value) {
          res.setHeader(name, value);
        },
        json(value) {
          json(res, status, value);
        },
      };
      const request: RequestLike = {
        method: req.method,
        headers: req.headers,
        body: payload,
      };
      await (
        url.pathname === "/api/admin" ? admin : url.pathname === "/api/reports" ? reports : health
      )(request, response);
      return;
    }
    if (url.pathname.startsWith("/packages/")) {
      const base = path.join(runtime, "public");
      const file = path.resolve(base, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep)) {
        json(res, 400, { error: "Invalid package path." });
        return;
      }
      try {
        const bytes = await readFile(file);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(bytes);
      } catch {
        json(res, 404, { error: "Synthetic package not found." });
      }
      return;
    }
    vite.middlewares(req, res, () => {
      json(res, 404, { error: "Not found." });
    });
  } catch {
    if (!res.headersSent)
      json(res, 400, {
        error: "The local request was rejected. Check its format or the private development logs.",
      });
    else res.end();
  }
});
async function stop() {
  if (stopping) return;
  stopping = true;
  pending.length = 0;
  for (const child of active.values()) child.kill("SIGTERM");
  await vite.close();
  server.close();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
server.listen(5180, "127.0.0.1", () => console.log(`Local application ready at ${origin}`));
