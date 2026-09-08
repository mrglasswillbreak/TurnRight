import { useEffect, useRef } from "react";
import type { CampusData, Place } from "./types";
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
}
export function useWebMcp(
  data: CampusData | null,
  select: (place: Place) => void,
  navigating: boolean,
) {
  const state = useRef({ data, select, navigating });
  state.current = { data, select, navigating };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const textInput = (input: unknown, key: string) => {
      const value = (input as Record<string, unknown>)?.[key];
      if (typeof value !== "string" || !value.trim() || value.length > 200)
        throw new Error(`A nonempty ${key} of at most 200 characters is required.`);
      return value.trim();
    };
    const tools: Tool[] = [
      {
        name: "search_campus_places",
        description:
          "Search the downloaded LASU Ojo campus places. Returns public place IDs and coverage; never device location.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          const query = textInput(input, "query").toLowerCase();
          return {
            places: (state.current.data?.places || [])
              .filter((p) =>
                `${p.name} ${p.aliases.join(" ")} ${p.department || ""} ${p.faculty || ""}`
                  .toLowerCase()
                  .includes(query),
              )
              .slice(0, 20)
              .map((p) => ({ id: p.id, name: p.name, arrivalKind: p.arrivalKind })),
          };
        },
      },
      {
        name: "show_campus_place",
        description:
          "Open the place details on the visible campus map and add it to device-local recents. Does not start GPS or navigation.",
        inputSchema: {
          type: "object",
          properties: { placeId: { type: "string" } },
          required: ["placeId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const id = textInput(input, "placeId");
          if (state.current.navigating) throw new Error("Finish the current walk first.");
          const place = state.current.data?.places.find((p) => p.id === id);
          if (!place) throw new Error("Unknown campus place ID.");
          state.current.select(place);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { id: place.id, name: place.name, view: "place-details" };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(
          () => {},
        );
      } catch {
        /* Optional proposed browser capability. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
