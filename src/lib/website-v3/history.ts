import type { DraftStatePayload } from "./types";
export type DraftHistory = {
  past: DraftStatePayload[];
  future: DraftStatePayload[];
};
/** Records a content edit while bounding memory and invalidating the redo branch. */
export function recordDraftEdit(
  history: DraftHistory,
  current: DraftStatePayload,
  next: DraftStatePayload,
): DraftHistory {
  if (JSON.stringify(current) === JSON.stringify(next)) return history;
  return { past: [...history.past.slice(-49), current], future: [] };
}
/** Restores a draft snapshot; callers feed it through the same autosave and preview path. */
export function travelDraftHistory(
  history: DraftHistory,
  current: DraftStatePayload,
  direction: "undo" | "redo",
): { history: DraftHistory; state: DraftStatePayload } | null {
  if (direction === "undo") {
    const target = history.past.at(-1);
    return target
      ? {
          state: target,
          history: {
            past: history.past.slice(0, -1),
            future: [current, ...history.future],
          },
        }
      : null;
  }
  const target = history.future[0];
  return target
    ? {
        state: target,
        history: {
          past: [...history.past, current],
          future: history.future.slice(1),
        },
      }
    : null;
}
