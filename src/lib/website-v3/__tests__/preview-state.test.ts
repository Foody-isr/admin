import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasCompletePreviewCoverage,
  recordPreviewAcknowledgement,
  stalePreviewDevices,
  type PreviewAcknowledgements,
  type PreviewExpectedRevisions,
} from "../preview-state";

const PAGE = "page:12";

function ack(revision: number, contentRevision: number, device: "desktop" | "mobile") {
  return { revision, contentRevision, activePageKey: PAGE, device };
}

test("a preview nobody has opened is never waited on", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: ack(3, 2, "desktop"),
    mobile: null,
  };
  const expected: PreviewExpectedRevisions = { desktop: 3, mobile: null };

  assert.deepEqual(stalePreviewDevices(acknowledgements, expected, 2, PAGE), []);
  assert.equal(hasCompletePreviewCoverage(acknowledgements, expected, 2, PAGE), true);
});

// The trap that silently killed the Publish button: mobile was opened once, and
// every later edit staled it again even though the operator never went back.
test("a preview opened once is named as stale after a later content edit", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: ack(5, 4, "desktop"),
    mobile: ack(2, 3, "mobile"),
  };
  const expected: PreviewExpectedRevisions = { desktop: 5, mobile: 2 };

  assert.deepEqual(stalePreviewDevices(acknowledgements, expected, 4, PAGE), ["mobile"]);
  assert.equal(hasCompletePreviewCoverage(acknowledgements, expected, 4, PAGE), false);
});

test("both previews can be stale at once", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: ack(1, 1, "desktop"),
    mobile: ack(1, 1, "mobile"),
  };
  const expected: PreviewExpectedRevisions = { desktop: 4, mobile: 3 };

  assert.deepEqual(stalePreviewDevices(acknowledgements, expected, 5, PAGE), [
    "desktop",
    "mobile",
  ]);
});

test("an acknowledgement for another page does not count", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: { revision: 4, contentRevision: 2, activePageKey: "page:99", device: "desktop" },
    mobile: null,
  };
  const expected: PreviewExpectedRevisions = { desktop: 4, mobile: null };

  assert.deepEqual(stalePreviewDevices(acknowledgements, expected, 2, PAGE), ["desktop"]);
});

test("before any preview is requested the desktop one is awaited", () => {
  const acknowledgements: PreviewAcknowledgements = { desktop: null, mobile: null };
  const expected: PreviewExpectedRevisions = { desktop: null, mobile: null };

  assert.deepEqual(stalePreviewDevices(acknowledgements, expected, 0, PAGE), ["desktop"]);
  assert.equal(hasCompletePreviewCoverage(acknowledgements, expected, 0, PAGE), false);
});

test("acknowledgements never move backwards", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: ack(9, 9, "desktop"),
    mobile: null,
  };

  const stale = recordPreviewAcknowledgement(acknowledgements, ack(4, 4, "desktop"));
  assert.equal(stale.desktop?.revision, 9);

  const fresh = recordPreviewAcknowledgement(acknowledgements, ack(11, 10, "desktop"));
  assert.equal(fresh.desktop?.revision, 11);
});
