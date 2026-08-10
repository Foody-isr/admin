import assert from "node:assert/strict";
import { test } from "node:test";
import {
  issueLabel, issueTone, issueCanBeAccepted, isSubmissionBlocked,
} from "../draftIssuePresentation";
import type { LineIssue } from "../draftLines";

// Stand-in for useI18n().t — templates match the real en strings in
// src/lib/i18n.tsx closely enough to catch a broken placeholder swap without
// coupling this test to the exact copy.
function t(key: string): string {
  const dict: Record<string, string> = {
    draftIssueMissing: "no longer exists",
    draftIssueSoldOut: "no longer available",
    draftIssuePriceChanged: "{was} ₪ → {now} ₪",
    draftIssueComboMissing: "{name} no longer exists",
    draftIssueComboSoldOut: "{name} is no longer available",
    draftIssueQuantityInvalid: "unreadable quantity",
  };
  return dict[key] ?? key;
}

test("issueLabel: missing", () => {
  assert.equal(issueLabel({ kind: "missing" }, t), "no longer exists");
});

test("issueLabel: sold_out", () => {
  assert.equal(issueLabel({ kind: "sold_out" }, t), "no longer available");
});

test("issueLabel: price_changed fills both figures", () => {
  const label = issueLabel({ kind: "price_changed", was: 25, now: 28 }, t);
  assert.equal(label, "25 ₪ → 28 ₪");
});

test("issueLabel: combo_part missing names the component", () => {
  const label = issueLabel(
    { kind: "combo_part", partName: "Salade Tuna", reason: "missing" }, t,
  );
  assert.equal(label, "Salade Tuna no longer exists");
});

test("issueLabel: combo_part sold_out names the component", () => {
  const label = issueLabel(
    { kind: "combo_part", partName: "Frites", reason: "sold_out" }, t,
  );
  assert.equal(label, "Frites is no longer available");
});

test("issueLabel: quantity_invalid", () => {
  assert.equal(issueLabel({ kind: "quantity_invalid" }, t), "unreadable quantity");
});

// Une quantité illisible ne s'accepte pas : la quantité part au serveur telle
// quelle, donc la seule sortie sûre est de retirer la ligne et de la reprendre.
test("quantity_invalid blocks and offers only Remove", () => {
  assert.equal(issueTone({ kind: "quantity_invalid" }), "danger");
  assert.equal(issueCanBeAccepted({ kind: "quantity_invalid" }), false);
  assert.equal(isSubmissionBlocked(new Map([["l1", { kind: "quantity_invalid" }]])), true);
});

test("issueTone: price_changed is a warning, everything else is danger", () => {
  const cases: LineIssue[] = [
    { kind: "missing" },
    { kind: "sold_out" },
    { kind: "combo_part", partName: "x", reason: "missing" },
    { kind: "combo_part", partName: "x", reason: "sold_out" },
  ];
  for (const issue of cases) assert.equal(issueTone(issue), "danger", issue.kind);
  assert.equal(issueTone({ kind: "price_changed", was: 1, now: 2 }), "warning");
});

test("issueCanBeAccepted: only price_changed", () => {
  assert.equal(issueCanBeAccepted({ kind: "price_changed", was: 1, now: 2 }), true);
  assert.equal(issueCanBeAccepted({ kind: "missing" }), false);
  assert.equal(issueCanBeAccepted({ kind: "sold_out" }), false);
  assert.equal(
    issueCanBeAccepted({ kind: "combo_part", partName: "x", reason: "missing" }),
    false,
  );
});

test("isSubmissionBlocked: empty map does not block", () => {
  assert.equal(isSubmissionBlocked(new Map()), false);
});

test("isSubmissionBlocked: any flagged line blocks", () => {
  const issues = new Map<string, LineIssue>([["l1", { kind: "sold_out" }]]);
  assert.equal(isSubmissionBlocked(issues), true);
});
// No separate "resolving the last issue unblocks" case: isSubmissionBlocked
// is pure over `.size`, so an emptied map and a map that started empty are
// indistinguishable to it — the "empty map does not block" case above
// already is that assertion, and a second test with different history would
// only look like coverage without adding any.
