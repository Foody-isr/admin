import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUnsavedDraft, runSaveFlow, type SaveOutcome } from "../draft-state";

const LABELS = { saved: "Enregistré", translateFailed: "Traduction indisponible" };

function collector() {
  const seen: SaveOutcome[] = [];
  return { seen, commit: (o: SaveOutcome) => void seen.push(o) };
}

// ─── Finding 3: keystrokes typed during the request ────────────────────────
//
// The owner types a word, presses Save, and keeps typing while the PUT is in
// flight. Clearing the dirty flag unconditionally hands the locale back to
// reload(), which overwrites any draft not marked dirty — so the textarea
// snaps back to what was sent and the extra word is gone with no warning.

test("the dirty flag survives when the draft moved on during the request", async () => {
  const { seen, commit } = collector();

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: null }),
    // The owner kept typing while the PUT was in flight.
    currentDraft: () => "Bonjour tout le monde",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit,
    reload: async () => undefined,
  });

  assert.equal(seen.length, 1);
  assert.equal(
    seen[0].clearDirty,
    false,
    "clearing the flag would let reload() wipe the keystrokes typed during the save",
  );
});

test("the dirty flag clears when the draft still matches what was sent", async () => {
  const { seen, commit } = collector();

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: null }),
    currentDraft: () => "Bonjour",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit,
    reload: async () => undefined,
  });

  assert.equal(seen[0].clearDirty, true);
});

// ─── Finding 4: a failed reload is not a failed save ───────────────────────
//
// The server handler is structured so its 200 branch is unreachable unless the
// source was written. Reporting the follow-up GET's error as the save's throws
// that guarantee away: the staff sees red, believes nothing was written, and
// retypes text that is already in the database.

test("a reload failure after a successful save still reports success", async () => {
  const { seen, commit } = collector();

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: null }),
    currentDraft: () => "Bonjour",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit,
    reload: async () => {
      throw new Error("GET /message-templates 502");
    },
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].status.tone, "success");
  assert.equal(seen[0].status.text, LABELS.saved);
});

test("a reload failure does not propagate out of the flow", async () => {
  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: null }),
    currentDraft: () => "Bonjour",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit: () => undefined,
    reload: async () => {
      throw new Error("network blip");
    },
  });
});

test("the outcome is committed before the reload is awaited", async () => {
  const order: string[] = [];

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: null }),
    currentDraft: () => "Bonjour",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit: () => void order.push("commit"),
    reload: async () => void order.push("reload"),
  });

  assert.deepEqual(order, ["commit", "reload"]);
});

test("a real save failure is reported as a failure, carrying its message", async () => {
  const { seen, commit } = collector();

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => {
      throw new Error("500 boom");
    },
    currentDraft: () => "Bonjour",
    translationFailed: () => false,
    labels: LABELS,
    commit,
    reload: async () => {
      throw new Error("must not run");
    },
  });

  assert.equal(seen[0].status.tone, "danger");
  assert.equal(seen[0].status.text, "500 boom");
  assert.equal(seen[0].clearDirty, false, "nothing was written, so the draft is still unsaved work");
});

test("a translation failure is a warning, never a failed save", async () => {
  const { seen, commit } = collector();

  await runSaveFlow({
    sent: "Bonjour",
    save: async () => ({ translation_error: "he: aws unavailable" }),
    currentDraft: () => "Bonjour",
    translationFailed: (r) => !!r.translation_error,
    labels: LABELS,
    commit,
    reload: async () => undefined,
  });

  assert.equal(seen[0].status.tone, "warning");
  assert.equal(seen[0].status.text, LABELS.translateFailed);
  assert.equal(seen[0].clearDirty, true, "the source language WAS written");
});

// ─── Finding 5: unsaved work in another language ───────────────────────────

test("a draft equal to the stored customization is not unsaved", () => {
  assert.equal(hasUnsavedDraft("Bonjour", { body: "Bonjour" }, "Défaut"), false);
});

test("a draft differing from the stored customization is unsaved", () => {
  assert.equal(hasUnsavedDraft("Bonsoir", { body: "Bonjour" }, "Défaut"), true);
});

// With no customization on the server, the shipped default IS what the
// restaurant currently receives — an untouched tab must not claim to hold
// unsaved work.
test("with no server row the registry default is the reference", () => {
  assert.equal(hasUnsavedDraft("Défaut", undefined, "Défaut"), false);
  assert.equal(hasUnsavedDraft("Autre chose", undefined, "Défaut"), true);
});
