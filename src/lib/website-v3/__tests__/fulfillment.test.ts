import assert from "node:assert/strict";
import test from "node:test";
import { websiteOrderChoicesAvailable } from "../fulfillment";

test("the editor follows enabled services, imposed batches and the menu lock", () => {
  const batch = {pickup_enabled: false, delivery_enabled: true, batch_fulfillment_enabled: true, scheduling_enabled: true};
  assert.equal(websiteOrderChoicesAvailable(batch, {}), false);
  assert.equal(websiteOrderChoicesAvailable({...batch, pickup_enabled: true}, {}), true);
  const scheduled = {...batch, batch_fulfillment_enabled: false};
  assert.equal(websiteOrderChoicesAvailable(scheduled, {}), true);
  assert.equal(websiteOrderChoicesAvailable(scheduled, {lock_order_type:true}), false);
  assert.equal(websiteOrderChoicesAvailable({...scheduled, scheduling_enabled:false}, {}), false);
  assert.equal(websiteOrderChoicesAvailable({...scheduled, delivery_enabled:false}, {}), false);
});
