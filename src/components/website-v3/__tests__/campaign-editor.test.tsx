import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {LocaleProvider} from "@/lib/i18n";
import type {WebsiteV3RuntimeCapabilities} from "@/lib/website-v3/runtime-capabilities";
import {CampaignRuntimeContext} from "../CampaignRuntimeContext";
import {CampaignSlidesEditor} from "../CampaignSlidesEditor";
import {editorElementLabel} from "../ElementInspector";
Object.assign(globalThis,{React});

test("nested campaign canvas selection keeps a human editor heading",()=>{
  assert.equal(editorElementLabel("slides.1.headline",key=>key),"editorHeadline");
  assert.equal(editorElementLabel("slides.1.image_url",key=>key),"editorBackgroundMedia");
});

test("campaign content exposes independent slide media, copy, framing and playback fields",()=>{
  const markup=renderToStaticMarkup(<LocaleProvider><CampaignRuntimeContext.Provider value={{campaign_hero:1,display_typography:1} as WebsiteV3RuntimeCapabilities}>
    <CampaignSlidesEditor restaurantId={1} section={{id:1,section_type:"hero_banner",page:"home",sort_order:0,is_visible:true,layout:"campaign",content:{slides:[{id:"first",headline:"Coffee",image_url:"/cup.svg",video_url:"/cup.mp4"},{id:"second",headline:"More coffee"}]},settings:{}}} onChange={()=>{}}/>
  </CampaignRuntimeContext.Provider></LocaleProvider>);
  for (const field of ["headline","subheadline","image_alt","cta_text","cta_link","video_url","background_color"]) assert.match(markup,new RegExp(`data-field-id="section.content.slides.0.${field}"`));
  for (const field of ["autoplay","slide_duration_seconds","image_fit","headline_size"]) assert.match(markup,new RegExp(`data-field-id="section.settings.${field}"`));
  assert.match(markup,/value="display"/);
  assert.match(markup,/Add a slide/);
  assert.match(markup,/Delete slide 2/);
});
