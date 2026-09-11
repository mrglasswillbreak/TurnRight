import { useState, type RefObject } from "react";
import { Check, Flag, GitCompareArrows, Layers, MapPin, RefreshCw, Upload, X } from "lucide-react";
import type { Map as MapInstance } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import type { CampusData, MapChange, Release, StudentReport } from "./types";
import type { EditorWorkspace } from "./editor-workspace";
export interface ReviewState {
  changes: MapChange[];
  reports: StudentReport[];
  jobs: { id: string; kind: string; status: string; message: string; created_at: string }[];
  releases: Release[];
}
export function EditorReview({ tab, state, workspace, validation, busy, action, mapRef, preview, setPreview, review, setReview }: {
  tab: string; state: ReviewState; workspace: EditorWorkspace;
  validation: { data: CampusData; errors: string[]; warnings: string[] }; busy: boolean;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
  mapRef: RefObject<MapInstance | null>; preview: boolean; setPreview: (value: boolean) => void;
  review: MapChange | null; setReview: (change: MapChange) => void;
}) {
  const [summary, setSummary] = useState("");
  return <>
            {tab === "changes" && (
              <>
                <h2>Source review</h2>
                <p className="small-note">
                  Daily checks propose changes. Your campus corrections always take precedence.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    action("check-sources", {}, "Source check queued. Refresh to see its result.")
                  }
                >
                  <RefreshCw /> Check now
                </Button>
                {state.jobs.slice(0, 3).map((job) => (
                  <div className={`job-status ${job.status}`} key={job.id}>
                    <strong>{job.status}</strong>
                    <p>{job.message || "Import in progress"}</p>
                    <small>{new Date(job.created_at).toLocaleString()}</small>
                  </div>
                ))}
                {state.changes.length === 0 && (
                  <div className="empty-state">
                    <GitCompareArrows />
                    <h3>No pending changes</h3>
                    <p>New source differences will appear here.</p>
                  </div>
                )}
                {state.changes.map((change) => (
                  <div
                    className={`change-card ${review?.id === change.id ? "selected" : ""}`}
                    key={change.id}
                  >
                    <button onClick={() => setReview(change)}>
                      <span className="change-kind">{change.kind}</span>
                      <strong>{change.summary}</strong>
                    </button>
                    <p className="small-note">{change.source_id}</p>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "review-change",
                            { id: change.id, accept: false },
                            "Change rejected; source baseline retained.",
                          )
                        }
                      >
                        <X /> Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "review-change",
                            { id: change.id, accept: true },
                            "Change accepted into the source baseline. Publish a release to update the public map.",
                          )
                        }
                      >
                        <Check /> Accept
                      </Button>
                    </div>
                    {review?.id === change.id && (
                      <details>
                        <summary>Before / after values</summary>
                        <pre>
                          {JSON.stringify({ before: change.before, after: change.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </>
            )}
            {tab === "reports" && (
              <>
                <h2>Student reports</h2>
                <p className="small-note">
                  Reports are private. Review the location before changing the map.
                </p>
                {!state.reports.length && (
                  <div className="empty-state">
                    <Flag />
                    <h3>No pending reports</h3>
                  </div>
                )}
                {state.reports.map((report) => (
                  <div className="change-card" key={report.id}>
                    <strong>{report.category.replaceAll("-", " ")}</strong>
                    <p>{report.description}</p>
                    <button
                      className="text-button"
                      onClick={() =>
                        mapRef.current?.flyTo({ center: report.coordinates, zoom: 19 })
                      }
                    >
                      <MapPin size={15} /> Show location
                    </button>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "resolve-report",
                            { id: report.id, status: "dismissed" },
                            "Report dismissed.",
                          )
                        }
                      >
                        Dismiss
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          action(
                            "resolve-report",
                            { id: report.id, status: "resolved" },
                            "Report marked resolved.",
                          )
                        }
                      >
                        Mark resolved
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {tab === "releases" && (
              <>
                <h2>Review, then publish</h2>
                <div className="validation-card">
                  <strong>
                    {validation.errors.length
                      ? "Validation needs attention"
                      : "Draft validation passed"}
                  </strong>
                  <p>
                    {validation.data.places.length} places · {validation.data.graph.edges.length}{" "}
                    path segments
                  </p>
                  {validation.errors.map((e) => (
                    <p className="form-error" key={e}>
                      {e}
                    </p>
                  ))}
                  {validation.warnings.map((w) => (
                    <p className="small-note" key={w}>
                      {w}
                    </p>
                  ))}
                </div>
                <p className="notice">
                  {validation.data.coverage.disconnected.length} places still lack a mapped
                  approach. Source-derived routes have not been field-verified.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(!preview);
                    
                  }}
                >
                  <Layers />
                  {preview ? "Show working map" : "Compare approved base"}
                </Button>
                <label className="field-label">
                  What changed?
                  <textarea
                    value={summary}
                    maxLength={500}
                    placeholder="Describe the corrections in this release…"
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </label>
                <Button
                  disabled={
                    busy || workspace.unfinished !== null || validation.errors.length > 0 || summary.trim().length < 5
                  }
                  onClick={() =>
                    action(
                      "prepare-release",
                      { summary },
                      "Immutable release queued. Review its deployment preview before publishing.",
                    )
                  }
                >
                  <Upload /> Build review preview
                </Button>
                {state.releases.map((release) => (
                  <div className="change-card" key={release.id}>
                    <span className="change-kind">{release.status}</span>
                    <h3>{release.summary}</h3>
                    <small>{new Date(release.created_at).toLocaleString()}</small>
                    {release.error && <p className="form-error">{release.error}</p>}
                    {release.preview_url && (
                      <a
                        className="source-link"
                        href={release.preview_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open exact release preview ↗
                      </a>
                    )}
                    {release.status === "preview" && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Publish this reviewed preview to the public TurnRight site?",
                            )
                          )
                            void action(
                              "publish-release",
                              { id: release.id },
                              "Publication requested. Refresh to verify the result.",
                            );
                        }}
                      >
                        Publish this preview
                      </Button>
                    )}
                    {release.status === "published" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Restore this previously published release?"))
                            void action(
                              "rollback",
                              { id: release.id },
                              "Restore requested. Refresh to verify the result.",
                            );
                        }}
                      >
                        Restore this release
                      </Button>
                    )}
                  </div>
                ))}
              </>
            )}

</>;
}
