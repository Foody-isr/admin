import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AutosaveSuspendedError,
  createSerializedAutosave,
} from "../autosave";
import type { DraftResponse, DraftStatePayload } from "../types";

function draft(marker: string): DraftStatePayload {
  return {
    config: { marker },
    pages: [],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
}

function response(state: DraftStatePayload): DraftResponse {
  return { state, draft_dirty: true };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("publish lifecycle drains the newest queued snapshot and rejects later edits", async () => {
  const first = deferred<DraftResponse>();
  const saved: string[] = [];
  const autosave = createSerializedAutosave(async (state) => {
    const marker = String(state.config.marker);
    saved.push(marker);
    if (marker === "first") return first.promise;
    return response(state);
  });

  const firstSave = autosave.enqueue(draft("first"));
  const newestSave = autosave.enqueue(draft("newest"));
  const lifecycle = autosave.beginLifecycle("publish");

  await assert.rejects(
    autosave.enqueue(draft("too-late")),
    AutosaveSuspendedError,
  );
  first.resolve(response(draft("first")));

  await firstSave;
  await newestSave;
  const drained = await lifecycle;
  assert.deepEqual(saved, ["first", "newest"]);
  assert.equal(drained?.state.config.marker, "newest");

  autosave.endLifecycle();
  await autosave.enqueue(draft("after"));
  assert.deepEqual(saved, ["first", "newest", "after"]);
});

test("discard lifecycle waits for the in-flight save and abandons queued snapshots", async () => {
  const first = deferred<DraftResponse>();
  const saved: string[] = [];
  const autosave = createSerializedAutosave(async (state) => {
    const marker = String(state.config.marker);
    saved.push(marker);
    return marker === "first" ? first.promise : response(state);
  });

  const firstSave = autosave.enqueue(draft("first"));
  const queuedSave = autosave.enqueue(draft("queued"));
  const lifecycle = autosave.beginLifecycle("discard");
  first.resolve(response(draft("first")));

  await firstSave;
  await lifecycle;
  await assert.rejects(queuedSave, AutosaveSuspendedError);
  assert.deepEqual(saved, ["first"]);
  assert.equal(autosave.getStatus(), "idle");
  autosave.endLifecycle();
});

test("reset refuses to hide an in-flight request", async () => {
  const pending = deferred<DraftResponse>();
  const autosave = createSerializedAutosave(() => pending.promise);
  const saving = autosave.enqueue(draft("first"));

  assert.throws(() => autosave.reset(), /in flight/i);
  pending.resolve(response(draft("first")));
  await saving;
});
