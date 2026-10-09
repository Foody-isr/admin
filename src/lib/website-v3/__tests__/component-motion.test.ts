import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendedComponentMotion } from "../component-motion";

test("Lovely presets associate each effect with its content", () => {
  assert.equal(recommendedComponentMotion("hero_banner").entrance, "fade");
  assert.equal(recommendedComponentMotion("menu_highlights").entrance, "zoom");
  assert.equal(recommendedComponentMotion("animated_text").entrance, "zoom");
  const editorial = recommendedComponentMotion("text_and_image");
  assert.equal(editorial.entrance, "split"); assert.equal(editorial.media_hover, "wobble");
  assert.equal(editorial.parallax, "up"); assert.equal(editorial.mobile_entrance, "from_bottom");
  assert.equal(editorial.button_hover, "push"); assert.equal(editorial.parallax_mobile, false);
});
