import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { ComponentAnimationFields } from "../ComponentAnimationFields";
import { fieldContract } from "../field-contracts";
import { recommendedComponentMotion } from "@/lib/website-v3/component-motion";
import type { DraftSectionPayload } from "@/lib/website-v3/types";
Object.assign(globalThis, {React});
function render(type: string, settings: Record<string, unknown>) {
  return renderToStaticMarkup(React.createElement(LocaleProvider, null, React.createElement(ComponentAnimationFields, {section: {id:1,section_type:type,layout:"carousel",settings,content:{}} as DraftSectionPayload,onChange:()=>{}})));
}
test("animation controls map every rendered field to persisted settings", () => {
  for (const type of ["text_and_image", "animated_text", "testimonials", "menu_highlights"]) {
    const html = render(type, {motion:recommendedComponentMotion(type), carousel_autoplay:true});
    for (const [,id] of Array.from(html.matchAll(/data-field-id="([^"]+)"/g))) assert.ok(fieldContract(id), id);
    assert.match(html, /section.settings.motion.enabled/);
  }
});
test("motion stays optional and controls match the component", () => {
  assert.doesNotMatch(render("text", {}), /section.settings.motion.duration_ms/);
  assert.match(render("text_and_image", {motion:recommendedComponentMotion("text_and_image")}), /section.settings.motion.media_hover/);
  assert.doesNotMatch(render("animated_text", {}), /section.settings.motion.media_hover|section.settings.motion.button_hover/);
  assert.match(render("animated_text", {}), /section.settings.motion.enabled[^>]+checked/);
});
