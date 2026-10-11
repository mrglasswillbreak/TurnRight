import { db, dispatch, HttpError } from "./backend.js";
import { currentCampusId } from "./campus-scope.js";
import type { MapChange } from "../src/types.js";
import type { SourceFilters, SourceOperation, SourceOverview } from "../src/source-updates.js";
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function sourceFilters(value: unknown): SourceFilters {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Choose valid source filters.");
  const input = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(input)) {
    if (
      !["query", "source", "layer", "featureType", "kind", "geometry"].includes(key) ||
      typeof v !== "string" ||
      v.length > 200
    )
      throw new HttpError(400, "Choose valid source filters.");
  }
  if (input.kind && !["add", "modify", "remove"].includes(String(input.kind)))
    throw new HttpError(400, "Choose an update type.");
  if (input.geometry && !["true", "false"].includes(String(input.geometry)))
    throw new HttpError(400, "Choose a valid geometry filter.");
  return input as SourceFilters;
}
async function dispatchReview(op: SourceOperation & { run_token: string }) {
  if (!["queued", "running"].includes(op.status)) return;
  try {
    await dispatch("source-review.yml", {
      campus_id: currentCampusId(),
      operation_id: op.id,
      run_token: op.run_token,
    });
  } catch {
    // A dispatch may have reached GitHub even when its response was lost. Keep
    // the same receipt/token: another dispatch can safely resume this job.
    throw new HttpError(
      503,
      "Could not confirm the worker started. Your selection is saved; use Resume worker on this operation.",
    );
  }
}
export async function sourceUpdatesAction(
  actor: string,
  action: string,
  p: Record<string, unknown>,
) {
  if (action === "source-updates-overview") {
    const overview = await db<SourceOverview>("rpc/source_review_overview", "POST", { actor });
    const legacy =
      currentCampusId() === "lasu"
        ? (
            await db<NonNullable<SourceOverview["legacy"]>[]>(
              "jobs?kind=eq.import&order=created_at.desc&limit=1",
            )
          )[0] || null
        : undefined;
    return {
      ...overview,
      legacy,
      scheduledOsmEnabled: process.env.OVERPASS_SCHEDULE_ALLOWED === "true",
    };
  }
  if (action === "source-updates-list" || action === "source-updates-map") {
    const cursor = p.cursor as { id?: unknown; createdAt?: unknown } | null | undefined;
    if (
      cursor &&
      (typeof cursor.id !== "string" ||
        cursor.id.length > 1000 ||
        typeof cursor.createdAt !== "string" ||
        !Number.isFinite(Date.parse(cursor.createdAt)))
    )
      throw new HttpError(400, "Invalid review page.");
    if (
      action === "source-updates-map" &&
      p.asOf !== undefined &&
      (typeof p.asOf !== "string" || !Number.isFinite(Date.parse(p.asOf)))
    )
      throw new HttpError(400, "Invalid map preview time.");
    return db(
      action === "source-updates-map" ? "rpc/source_review_map" : "rpc/source_review_list",
      "POST",
      {
        actor,
        filters: sourceFilters(p.filters || {}),
        page_cursor: cursor || null,
        ...(action === "source-updates-map" ? { as_of: p.asOf || null } : {}),
      },
    );
  }
  if (action === "source-updates-detail") {
    if (typeof p.id !== "string" || p.id.length > 1000)
      throw new HttpError(400, "Choose a source change.");
    const [change] = await db<(MapChange & { review_revision: number })[]>(
      `map_changes?id=eq.${encodeURIComponent(p.id)}`,
    );
    if (!change) throw new HttpError(404, "Source change not found.");
    const record = (change.after || change.before) as {
      payload?: { id?: string; properties?: { id?: string } };
    } | null;
    const ids = [
      ...new Set(
        [
          change.source_id,
          change.source_id.replace(/^(feature|place|edge):/, ""),
          record?.payload?.id,
          record?.payload?.properties?.id,
        ].filter((v): v is string => typeof v === "string"),
      ),
    ];
    // Literal equality requests avoid interpolating imported identities as query syntax.
    const edits = (
      await Promise.all(
        ids.map((id) =>
          db<
            Array<{
              id: string;
              kind: string;
              properties: Record<string, unknown>;
              geometry: unknown;
              deleted: boolean;
            }>
          >(`map_edits?select=id,kind,properties,geometry,deleted&id=eq.${encodeURIComponent(id)}`),
        ),
      )
    ).flat();
    return {
      change,
      overrides: [
        ...new Map(
          edits.map((edit) => [
            `${edit.kind}:${edit.id}`,
            {
              id: edit.id,
              kind: edit.kind,
              fields: [...Object.keys(edit.properties), ...(edit.geometry ? ["geometry"] : [])],
              deleted: edit.deleted,
            },
          ]),
        ).values(),
      ],
    };
  }
  if (action === "source-updates-history") {
    if (p.operationId !== undefined && !uuid(p.operationId))
      throw new HttpError(400, "Invalid operation.");
    if (p.cursor !== undefined && (typeof p.cursor !== "string" || p.cursor.length > 1000))
      throw new HttpError(400, "Invalid results page.");
    return db("rpc/source_review_history", "POST", {
      actor,
      operation_id: p.operationId || null,
      item_cursor: p.cursor || "",
    });
  }
  if (action === "source-updates-prepare") {
    if (!uuid(p.operationId)) throw new HttpError(400, "Invalid selection identity.");
    const selection = p.selection as {
      mode?: string;
      items?: Array<{ id: string; revision: number }>;
      filters?: unknown;
    };
    if (selection?.mode === "filter") selection.filters = sourceFilters(selection.filters || {});
    else if (
      selection?.mode !== "ids" ||
      !Array.isArray(selection.items) ||
      !selection.items.length ||
      selection.items.length > 10000 ||
      selection.items.some(
        (i) =>
          !i ||
          typeof i.id !== "string" ||
          i.id.length > 1000 ||
          !Number.isSafeInteger(i.revision) ||
          i.revision < 1,
      )
    )
      throw new HttpError(400, "Choose source updates or all matching results.");
    return db("rpc/source_review_prepare", "POST", {
      actor_id: actor,
      operation_id: p.operationId,
      selection,
    });
  }
  if (action === "source-updates-control") {
    if (
      !uuid(p.operationId) ||
      !["start", "cancel", "retry", "resume"].includes(String(p.command)) ||
      (p.command === "start" && typeof p.accept !== "boolean")
    )
      throw new HttpError(400, "Invalid review decision.");
    const op = await db<SourceOperation & { run_token: string }>(
      "rpc/source_review_control",
      "POST",
      {
        actor_id: actor,
        operation_id: p.operationId,
        command: p.command === "resume" ? "start" : p.command,
        decision: p.accept ?? null,
        acknowledge_removals: p.acknowledgeRemovals === true,
      },
    );
    if (p.command !== "cancel") await dispatchReview(op);
    const { run_token: _token, ...result } = op;
    return result;
  }
  if (action === "source-updates-check") {
    if (!uuid(p.sourceId)) throw new HttpError(400, "Choose a connected source.");
    const result = await db<{
      created: boolean;
      job: { id: string; run_token: string; status: string };
    }>("rpc/queue_source_check", "POST", {
      actor,
      source_identity: p.sourceId,
    });
    if (result.created) {
      try {
        await dispatch("map-import.yml", {
          campus_id: currentCampusId(),
          import_id: result.job.id,
          run_token: result.job.run_token,
        });
      } catch {
        await db(
          `campus_imports?id=eq.${result.job.id}&status=eq.queued&run_token=eq.${result.job.run_token}`,
          "PATCH",
          {
            status: "failed",
            message: "Could not start source check. Check again to retry.",
            updated_at: new Date().toISOString(),
          },
        );
        throw new HttpError(503, "Could not start the source check. Try again.");
      }
    }
    return {
      id: result.job.id,
      status: result.job.status,
      created: result.created,
    };
  }
  throw new HttpError(400, "Unknown source update action.");
}
