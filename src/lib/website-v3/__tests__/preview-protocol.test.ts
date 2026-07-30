import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isWebsiteV3AppliedMessage,
  isWebsiteV3StateMessage,
  WEBSITE_V3_APPLIED,
  WEBSITE_V3_STATE,
} from "../preview-protocol";
import {
  hasCompletePreviewCoverage,
  recordPreviewAcknowledgement,
  type PreviewAcknowledgements,
  type PreviewExpectedRevisions,
} from "../preview-state";

const state = {
  config: {},
  pages: [],
  sections: [],
  deleted_page_ids: [],
  deleted_section_ids: [],
};

test("preview state and acknowledgement carry content revision and device", () => {
  assert.equal(
    isWebsiteV3StateMessage({
      type: WEBSITE_V3_STATE,
      revision: 8,
      contentRevision: 3,
      restaurantId: 4,
      activePageKey: "page-1",
      device: "mobile",
      state,
    }),
    true,
  );
  assert.equal(
    isWebsiteV3AppliedMessage({
      type: WEBSITE_V3_APPLIED,
      revision: 8,
      contentRevision: 3,
      activePageKey: "page-1",
      device: "mobile",
    }),
    true,
  );
});

test("preview acknowledgement rejects missing or invalid device identity", () => {
  assert.equal(
    isWebsiteV3AppliedMessage({
      type: WEBSITE_V3_APPLIED,
      revision: 8,
      contentRevision: 3,
      activePageKey: "page-1",
    }),
    false,
  );
  assert.equal(
    isWebsiteV3AppliedMessage({
      type: WEBSITE_V3_APPLIED,
      revision: 8,
      contentRevision: 3,
      activePageKey: "page-1",
      device: "tablet",
    }),
    false,
  );
});

test("publish coverage requires desktop and mobile acknowledgements of the same content", () => {
  let acknowledgements: PreviewAcknowledgements = {
    desktop: null,
    mobile: null,
  };
  const expectedRevisions: PreviewExpectedRevisions = {
    desktop: 8,
    mobile: 9,
  };
  acknowledgements = recordPreviewAcknowledgement(acknowledgements, {
    revision: 8,
    contentRevision: 3,
    activePageKey: "page-1",
    device: "desktop",
  });
  assert.equal(
    hasCompletePreviewCoverage(
      acknowledgements,
      expectedRevisions,
      3,
      "page-1",
    ),
    false,
  );
  acknowledgements = recordPreviewAcknowledgement(acknowledgements, {
    revision: 9,
    contentRevision: 3,
    activePageKey: "page-1",
    device: "mobile",
  });
  assert.equal(
    hasCompletePreviewCoverage(
      acknowledgements,
      expectedRevisions,
      3,
      "page-1",
    ),
    true,
  );
  assert.equal(
    hasCompletePreviewCoverage(
      acknowledgements,
      expectedRevisions,
      4,
      "page-1",
    ),
    false,
  );
});

test("publish coverage accepts the current preview when mobile was not requested", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: {
      revision: 8,
      contentRevision: 3,
      activePageKey: "page-1",
      device: "desktop",
    },
    mobile: null,
  };

  assert.equal(
    hasCompletePreviewCoverage(
      acknowledgements,
      { desktop: 8, mobile: null },
      3,
      "page-1",
    ),
    true,
  );
});

test("publish coverage rejects a stale acknowledgement for either device", () => {
  const acknowledgements: PreviewAcknowledgements = {
    desktop: {
      revision: 7,
      contentRevision: 3,
      activePageKey: "page-1",
      device: "desktop",
    },
    mobile: {
      revision: 9,
      contentRevision: 3,
      activePageKey: "page-1",
      device: "mobile",
    },
  };
  assert.equal(
    hasCompletePreviewCoverage(
      acknowledgements,
      { desktop: 8, mobile: 9 },
      3,
      "page-1",
    ),
    false,
  );
});
