import { useEffect, useSyncExternalStore } from "react";
import { EditorWorkspace } from "./editor-workspace";

export function useEditorWorkspace(workspace: EditorWorkspace) {
  const revision = useSyncExternalStore(workspace.subscribe, workspace.getRevision);
  useEffect(() => {
    if (!workspace.dirty || ["Conflict", "Saving", "Recovery unavailable"].includes(workspace.status) || workspace.error) return;
    const timer = setTimeout(() => { void workspace.flush(); }, 750);
    return () => clearTimeout(timer);
  }, [workspace, revision]);
  useEffect(() => {
    const online = () => { void workspace.flush(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (workspace.dirty || workspace.unfinished || workspace.status === "Recovery unavailable") { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("online", online); window.removeEventListener("beforeunload", unload); };
  }, [workspace]);
  return workspace;
}
