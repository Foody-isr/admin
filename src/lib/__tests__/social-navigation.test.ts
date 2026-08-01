import assert from "node:assert/strict";
import { test } from "node:test";
import { isActiveSocialConnection } from "../social-navigation";

test("Instagram navigation requires a connected and enabled connection", () => {
  assert.equal(isActiveSocialConnection(null), false);
  assert.equal(isActiveSocialConnection({ connected: false, enabled: true }), false);
  assert.equal(isActiveSocialConnection({ connected: true, enabled: false }), false);
  assert.equal(isActiveSocialConnection({ connected: true }), true);
  assert.equal(isActiveSocialConnection({ connected: true, enabled: true }), true);
});
