import { randomUUID } from "node:crypto";
import {
  allRows,
  bodyOf,
  db,
  dispatch,
  fail,
  HttpError,
  privateHeaders,
  requireAdmin,
  type RequestLike,
  type ResponseLike,
} from "../server/backend.js";
import { validateEdit } from "../src/editor-model.js";
export default async function handler(req: RequestLike, res: ResponseLike) {
  privateHeaders(res);
  try {
    const user = await requireAdmin(req);
    const { action, payload = {} } = bodyOf(req);
    switch (action) {
      case "state": {
        const [edits, changes, reports, jobs, releases] = await Promise.all([
          allRows("map_edits"),
          db("map_changes?status=eq.pending&order=created_at.desc&limit=300"),
          db("reports?status=eq.pending&order=created_at.desc&limit=200"),
          db("jobs?order=created_at.desc&limit=20"),
          db(
            "releases?select=id,status,summary,created_at,preview_url,deployment_url,error,version&order=created_at.desc&limit=20",
          ),
        ]);
        res.status(200).json({ edits, changes, reports, jobs, releases });
        break;
      }
      case "sources":
        res.status(200).json({ features: await allRows("source_features") });
        break;
      case "save-edit":
      case "save-edits": {
        const items = action === "save-edit" ? [{ edit: payload, expectedUpdatedAt: payload.updated_at || null }] : payload.edits;
        const operationId = action === "save-edit" ? randomUUID() : payload.operationId;
        if (typeof operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId) || !Array.isArray(items) || !items.length || items.length > 500)
          throw new HttpError(400, "Invalid edit batch.");
        const keys = new Set<string>();
        const clean = items.map((item) => {
          const errors = validateEdit(item?.edit);
          if (errors.length) throw new HttpError(400, errors.join(" "));
          if (item.expectedUpdatedAt !== null && (typeof item.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(item.expectedUpdatedAt)))) throw new HttpError(400, "Invalid draft revision.");
          const { id, kind, geometry, properties, deleted } = item.edit;
          const key = `${kind}:${id}`;
          if (keys.has(key)) throw new HttpError(400, "Duplicate edit in batch.");
          keys.add(key);
          return { edit: { id, kind, geometry, properties, deleted: !!deleted }, expectedUpdatedAt: item.expectedUpdatedAt };
        });
        const result = await db("rpc/save_editor_batch", "POST", { operation_id: operationId, actor_id: user.id, items: clean });
        res.status(200).json(action === "save-edit" ? result[0] : result);
        break;
      }
      case "review-change": {
        if (typeof payload.id !== "string" || typeof payload.accept !== "boolean")
          throw new HttpError(400, "Invalid review decision");
        await db("rpc/review_map_change", "POST", {
          change_id: payload.id,
          accept_change: payload.accept,
        });
        res.status(200).json({ ok: true });
        break;
      }
      case "resolve-report": {
        if (!["resolved", "dismissed"].includes(payload.status) || typeof payload.id !== "string")
          throw new HttpError(400, "Invalid report action");
        await db(`reports?id=eq.${encodeURIComponent(payload.id)}`, "PATCH", {
          status: payload.status,
        });
        res.status(200).json({ ok: true });
        break;
      }
      case "check-sources": {
        const recent = await db(
          "jobs?kind=eq.import&status=in.(queued,running)&order=created_at.desc&limit=1",
        );
        if (recent[0] && Date.now() - Date.parse(recent[0].created_at) < 15 * 60000)
          throw new HttpError(409, "An import is already running.");
        const [job] = await db("jobs", "POST", { kind: "import", status: "queued" });
        try {
          await dispatch("source-update.yml", { job_id: job.id });
        } catch (e) {
          await db(`jobs?id=eq.${job.id}`, "PATCH", {
            status: "failed",
            message: (e as Error).message,
          });
          throw e;
        }
        res.status(202).json({ id: job.id });
        break;
      }
      case "prepare-release": {
        if (
          typeof payload.summary !== "string" ||
          payload.summary.trim().length < 5 ||
          payload.summary.length > 500
        )
          throw new HttpError(400, "Provide a release summary between 5 and 500 characters.");
        const id = await db<string>("rpc/snapshot_release", "POST", {
          release_summary: payload.summary.trim(),
        });
        try {
          await dispatch("release.yml", { release_id: id, operation: "preview" });
        } catch (e) {
          await db(`releases?id=eq.${id}`, "PATCH", {
            status: "failed",
            error: (e as Error).message,
          });
          throw e;
        }
        res.status(202).json({ id });
        break;
      }
      case "publish-release":
      case "rollback": {
        if (typeof payload.id !== "string") throw new HttpError(400, "Choose a release");
        const [release] = await db(
          `releases?id=eq.${encodeURIComponent(payload.id)}&select=id,status,deployment_id`,
        );
        if (
          !release?.deployment_id ||
          (action === "publish-release" && release.status !== "preview") ||
          (action === "rollback" && release.status !== "published")
        )
          throw new HttpError(400, "This release is not ready for that action.");
        await dispatch("release.yml", {
          release_id: release.id,
          operation: action === "rollback" ? "rollback" : "publish",
        });
        res.status(202).json({ id: release.id });
        break;
      }
      case "export":
        res.status(200).json({
          sources: await allRows("source_features"),
          edits: await allRows("map_edits"),
          history: await allRows("edit_history"),
        });
        break;
      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (error) {
    fail(res, error);
  }
}
