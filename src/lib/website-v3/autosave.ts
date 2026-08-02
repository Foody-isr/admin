import type { DraftResponse, DraftStatePayload } from "./types";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type SerializedAutosave = {
  enqueue(state: DraftStatePayload): Promise<DraftResponse>;
  flush(): Promise<DraftResponse | null>;
  beginLifecycle(mode: "publish" | "discard"): Promise<DraftResponse | null>;
  endLifecycle(): void;
  getStatus(): AutosaveStatus;
  reset(): void;
};

/** Signals that an edit arrived while publication or discard owned the draft. */
export class AutosaveSuspendedError extends Error {
  constructor() {
    super("Website draft autosave is suspended for a lifecycle operation");
    this.name = "AutosaveSuspendedError";
  }
}

type SaveWaiter = {
  resolve: (response: DraftResponse) => void;
  reject: (error: unknown) => void;
};

type PendingSave = {
  state: DraftStatePayload;
  waiters: SaveWaiter[];
};

/**
 * Serializes full-draft saves and coalesces edits made during a request into
 * the newest queued snapshot.
 */
export function createSerializedAutosave(
  save: (state: DraftStatePayload) => Promise<DraftResponse>,
): SerializedAutosave {
  let status: AutosaveStatus = "idle";
  let inFlight: Promise<DraftResponse> | null = null;
  let queued: PendingSave | null = null;
  let lastResponse: DraftResponse | null = null;
  let lastError: unknown = null;
  let lifecycleMode: "publish" | "discard" | null = null;

  const run = (allowSuspended = false): Promise<DraftResponse> | null => {
    if (inFlight || !queued) return inFlight;
    if (lifecycleMode && !allowSuspended) return null;

    const pending = queued;
    queued = null;
    status = "saving";
    lastError = null;

    inFlight = save(pending.state)
      .then((response) => {
        lastResponse = response;
        pending.waiters.forEach(({ resolve }) => resolve(response));
        status = queued ? "saving" : "saved";
        return response;
      })
      .catch((error: unknown) => {
        lastError = error;
        pending.waiters.forEach(({ reject }) => reject(error));
        queued = queued
          ? { state: queued.state, waiters: queued.waiters }
          : { state: pending.state, waiters: [] };
        status = "error";
        throw error;
      })
      .finally(() => {
        inFlight = null;
        if (
          status !== "error" &&
          queued &&
          lifecycleMode !== "discard"
        ) {
          run(lifecycleMode === "publish")?.catch(() => undefined);
        }
      });

    return inFlight;
  };

  return {
    enqueue(state) {
      if (lifecycleMode) {
        return Promise.reject(new AutosaveSuspendedError());
      }
      status = "saving";
      return new Promise<DraftResponse>((resolve, reject) => {
        queued = {
          state,
          waiters: [...(queued?.waiters ?? []), { resolve, reject }],
        };
        run()?.catch(() => undefined);
      });
    },
    async flush() {
      if (status === "error" && lastError) throw lastError;
      while (inFlight || queued) {
        const active = inFlight ?? run(lifecycleMode === "publish");
        if (active) await active;
      }
      return lastResponse;
    },
    async beginLifecycle(mode) {
      if (lifecycleMode) {
        throw new Error("Website draft lifecycle already in progress");
      }
      lifecycleMode = mode;
      if (mode === "publish") {
        return this.flush();
      }

      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // Discard intentionally abandons a failed draft snapshot.
        }
      }
      const abandoned = queued;
      queued = null;
      abandoned?.waiters.forEach(({ reject }) =>
        reject(new AutosaveSuspendedError()),
      );
      lastError = null;
      status = "idle";
      return lastResponse;
    },
    endLifecycle() {
      lifecycleMode = null;
    },
    getStatus() {
      return status;
    },
    reset() {
      if (inFlight) {
        throw new Error("Cannot reset Website draft autosave while a request is in flight");
      }
      queued?.waiters.forEach(({ reject }) =>
        reject(new AutosaveSuspendedError()),
      );
      queued = null;
      status = "idle";
      lastError = null;
      lastResponse = null;
    },
  };
}
