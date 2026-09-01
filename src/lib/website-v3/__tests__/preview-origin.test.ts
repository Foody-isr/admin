import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWebsiteV3PreviewOrigin } from "../preview-origin";

test("website preview keeps official admin environments aligned", () => {
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      undefined,
      "https://dev-admin.foody-pos.co.il/24/website",
    ),
    "https://dev-app.foody-pos.co.il",
  );
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      undefined,
      "https://admin.foody-pos.co.il/24/website",
    ),
    "https://app.foody-pos.co.il",
  );
});

test("website preview uses local guest web for local admin", () => {
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      undefined,
      "http://localhost:3003/24/website",
    ),
    "http://localhost:3000",
  );
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      undefined,
      "http://127.0.0.1:3003/24/website",
    ),
    "http://127.0.0.1:3000",
  );
});

test("website preview honors a valid explicit deployment origin", () => {
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      "https://foodyweb-feature.example.com/some/path",
      "https://dev-admin.foody-pos.co.il/24/website",
    ),
    "https://foodyweb-feature.example.com",
  );
});

test("website preview fails invalid and unknown deployments into dev", () => {
  assert.equal(
    resolveWebsiteV3PreviewOrigin(
      "javascript:alert(1)",
      "https://foodyadmin-feature.vercel.app/24/website",
    ),
    "https://dev-app.foody-pos.co.il",
  );
  assert.equal(
    resolveWebsiteV3PreviewOrigin(undefined, undefined),
    "https://dev-app.foody-pos.co.il",
  );
});
