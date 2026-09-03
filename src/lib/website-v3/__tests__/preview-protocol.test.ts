import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAcknowledgeLegacyWebsitePreview,
  isLegacyWebsiteReadyMessage,
  isWebsiteV3AppliedMessage,
  isWebsiteV3NavigateMessage,
  isWebsiteV3StateMessage,
  legacyWebsiteStateMessage,
  withWebsiteV3PreviewNavigationState,
  LEGACY_WEBSITE_READY,
  LEGACY_WEBSITE_STATE,
  WEBSITE_V3_APPLIED,
  WEBSITE_V3_NAVIGATE,
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

test("preview navigation accepts only a stable page key", () => {
  assert.equal(
    isWebsiteV3NavigateMessage({
      type: WEBSITE_V3_NAVIGATE,
      pageKey: "page-1",
    }),
    true,
  );
  assert.equal(
    isWebsiteV3NavigateMessage({
      type: WEBSITE_V3_NAVIGATE,
      pageKey: "",
    }),
    false,
  );
});

test("preview navigation injects refreshed Stories eligibility without mutating the draft", () => {
  const previewState = withWebsiteV3PreviewNavigationState(state, true);
  assert.equal(previewState.config.stories_navigation_available, true);
  assert.equal(Object.hasOwn(state.config, "stories_navigation_available"), false);
  assert.notEqual(previewState, state);
  assert.equal(
    withWebsiteV3PreviewNavigationState(previewState, false).config
      .stories_navigation_available,
    false,
  );
  assert.equal(
    withWebsiteV3PreviewNavigationState(previewState, undefined).config
      .stories_navigation_available,
    false,
  );
});

test("legacy preview compatibility is limited to the landing-page surface", () => {
  assert.equal(
    isLegacyWebsiteReadyMessage({ type: LEGACY_WEBSITE_READY }),
    true,
  );
  assert.equal(
    isLegacyWebsiteReadyMessage({ type: LEGACY_WEBSITE_READY, extra: true }),
    false,
  );
  assert.deepEqual(legacyWebsiteStateMessage(state), {
    type: LEGACY_WEBSITE_STATE,
    state,
  });
  assert.equal(canAcknowledgeLegacyWebsitePreview("landing", "page"), true);
  assert.equal(canAcknowledgeLegacyWebsitePreview("content", "page"), false);
  assert.equal(canAcknowledgeLegacyWebsitePreview("order", "page"), false);
  assert.equal(
    canAcknowledgeLegacyWebsitePreview("landing", "checkout"),
    false,
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
