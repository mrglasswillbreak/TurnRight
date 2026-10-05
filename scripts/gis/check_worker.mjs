/** Native acceptance for the actual host/container/export/cleanup boundary. */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.platform, "linux", "Run native worker acceptance on Linux");
assert.notEqual(process.getuid(), 0, "Use an ordinary host UID to exercise bind-mount ownership");
const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "turnright-worker-test-"));
const id = randomUUID(),
  token = randomUUID();
const job = {
  tool: "export",
  run_token: token,
  input_revision: 1,
  request: {
    tool: "export",
    input: { datasetId: "fixture", revision: 1 },
    parameters: { format: "gpkg", crs: "EPSG:4326" },
  },
  inputs: {
    input: {
      features: [
        {
          type: "Feature",
          id: "tree-1",
          geometry: { type: "Point", coordinates: [3.2, 6.46] },
          properties: { name: "Fixture tree" },
        },
      ],
    },
    schema: { version: 1, fields: [{ name: "name", type: "text" }] },
    crs: "EPSG:32631",
  },
};
let archive, result;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/rest/v1/rpc/gis_claim_job") return response.end(JSON.stringify(job));
    if (url.pathname === "/rest/v1/gis_jobs" && request.method === "GET") {
      assert.equal(url.searchParams.get("campus_id"), "eq.fixture");
      return response.end(JSON.stringify([{ status: "running", run_token: token }]));
    }
    if (
      url.pathname.startsWith("/storage/v1/object/gis-private/fixture/" + id + "/" + token + "/")
    ) {
      archive = body;
      assert.equal(body.subarray(0, 4).toString("hex"), "504b0304");
      return response.end("{}");
    }
    if (url.pathname === "/rest/v1/rpc/gis_finish_job") {
      const message = JSON.parse(body);
      assert.equal(message.job_identity, id);
      assert.equal(message.token, token);
      result = message.result;
      return response.end("true");
    }
    response.writeHead(404);
    response.end(JSON.stringify({ message: "Unexpected fixture request" }));
  } catch (error) {
    response.writeHead(500);
    response.end(JSON.stringify({ message: error.message }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const executed = await promisify(execFile)(process.execPath, ["scripts/gis-worker.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      TMPDIR: temporary,
      CAMPUS_ID: "fixture",
      GIS_JOB_ID: id,
      SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
      SUPABASE_SERVICE_ROLE_KEY: "disposable-test-fixture",
    },
    timeout: 120000,
  });
  assert.match(executed.stdout, /GIS job completed/);
  assert.equal(result.error, undefined);
  assert.equal(result.artifact.format, "gpkg");
  assert.equal(result.artifact.bytes, archive.length);
  assert.equal(result.artifact.sha256, createHash("sha256").update(archive).digest("hex"));
  assert.deepEqual(
    await fs.readdir(temporary),
    [],
    "The real worker must remove its entire private scratch directory",
  );
  const file = path.join(temporary, "export.zip");
  await fs.writeFile(file, archive);
  await promisify(execFile)("python3", [
    "-c",
    [
      "import json,pathlib,sqlite3,sys,tempfile,zipfile",
      "with zipfile.ZipFile(sys.argv[1]) as archive, tempfile.TemporaryDirectory() as scratch:",
      " assert set(archive.namelist()) == {'data.gpkg','metadata.json'}",
      " metadata=json.loads(archive.read('metadata.json'))",
      " assert metadata['outputCRS']=='EPSG:4326' and metadata['inputRevision']==1",
      " file=pathlib.Path(scratch)/'data.gpkg'; file.write_bytes(archive.read('data.gpkg'))",
      " with sqlite3.connect(file) as database:",
      "  assert database.execute('select count(*) from features').fetchone()[0]==1",
      "  assert database.execute('select srs_id from gpkg_geometry_columns').fetchone()[0]==4326",
      "  assert database.execute('select turnright_feature_id,name from features').fetchone()==('tree-1','Fixture tree')",
    ].join("\n"),
    file,
  ]);
  console.log(
    "Actual isolated worker: GeoPackage upload, identity/CRS, result receipt and host cleanup passed",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(path.dirname(temporary), os.tmpdir());
  assert.ok(path.basename(temporary).startsWith("turnright-worker-test-"));
  await fs.rm(temporary, { recursive: true, force: true });
}
