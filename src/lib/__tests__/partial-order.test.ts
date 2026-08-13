import assert from "node:assert/strict";
import { test } from "node:test";
import { orderBy, reorder } from "../partial-order";

test("orderBy leaves the natural order alone when nothing is saved", () => {
  assert.deepEqual(orderBy([1, 2, 3], []), [1, 2, 3]);
});

test("orderBy applies the saved arrangement", () => {
  assert.deepEqual(orderBy([1, 2, 3], [3, 1, 2]), [3, 1, 2]);
});

// The whole reason the preference is stored partially: a column shipped after a
// restaurant saved its layout must still appear, not vanish.
test("orderBy keeps ids the preference never mentions, in their natural position", () => {
  assert.deepEqual(orderBy(["a", "b", "c"], ["c", "a"]), ["c", "a", "b"]);
});

test("orderBy drops ids that no longer exist", () => {
  assert.deepEqual(orderBy(["a", "b"], ["gone", "b", "a"]), ["b", "a"]);
});

test("orderBy handles a preference that covers nothing present", () => {
  assert.deepEqual(orderBy(["a", "b"], ["x", "y"]), ["a", "b"]);
});

test("reorder moves an id to just before the drop target", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
});

test("reorder moves forward as well as backward", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "a", "c"), ["b", "a", "c"]);
});

test("reorder is a no-op when dropped on itself", () => {
  assert.deepEqual(reorder(["a", "b"], "a", "a"), ["a", "b"]);
});

test("reorder is a no-op when the target is unknown", () => {
  assert.deepEqual(reorder(["a", "b"], "a", "zz"), ["a", "b"]);
});

test("reorder works on numeric ids too", () => {
  assert.deepEqual(reorder([1, 2, 3], 3, 2), [1, 3, 2]);
});
