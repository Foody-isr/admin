import assert from "node:assert/strict";
import test from "node:test";
import { campaignSlidesForSection, normalizeCampaignSection, normalizeCampaignSlides } from "../campaign";
import { campaignRuntimeErrors, type WebsiteV3RuntimeCapabilities } from "../runtime-capabilities";
import { normalizeDraftState } from "../state";

const state = () => normalizeDraftState({pages:[{id:1,type:"landing",slug:"home",is_homepage:true}],sections:[{
  id:1,section_type:"hero_banner",page_id:1,page:"home",layout:"campaign",content:{headline:"Existing title",image_url:"/cup.png"},settings:{},
}]});
test("campaign normalization keeps legacy media, bounds slides and repairs duplicate stable identities", () => {
  const original = state().sections[0];
  assert.equal(campaignSlidesForSection(original)[0].headline,"Existing title");
  assert.equal(campaignSlidesForSection(original)[0].image_url,"/cup.png");
  assert.equal(campaignSlidesForSection({...original,content:{...original.content,slides:[null,"bad",[]]}})[0].headline,"Existing title");
  const slides = normalizeCampaignSlides(Array.from({length:9},() => ({id:"same",headline:"Cup",background_color:"unsafe",image_framing:{desktop:{zoom:99,x:-5,y:130,fit:"contain"}}})));
  assert.equal(slides.length,6);
  assert.equal(new Set(slides.map(slide => slide.id)).size,6);
  assert.equal(slides[0].background_color,"#ffb9cd");
  assert.deepEqual(slides[0].image_framing?.desktop,{x:0,y:100,zoom:3,fit:"contain"});
  assert.equal(normalizeCampaignSection({...original,settings:{slide_duration_seconds:120}}).settings.slide_duration_seconds,30);
  assert.equal(normalizeCampaignSection({...original,settings:{slide_duration_seconds:-3}}).settings.slide_duration_seconds,10);
  assert.equal(normalizeCampaignSection({...original,settings:{slide_duration_seconds:2}}).settings.slide_duration_seconds,5);
  assert.equal(normalizeCampaignSection({...original,settings:{autoplay:"true"}}).settings.autoplay,false);
  const legacy = {...original,layout:"centered",settings:{}};
  assert.deepEqual(normalizeCampaignSection(legacy),legacy);
});
test("campaign capability checks leave existing sites editable and gate each new feature independently", () => {
  const draft = state(), capabilities = {} as WebsiteV3RuntimeCapabilities;
  assert.equal(campaignRuntimeErrors(draft,capabilities).length,1);
  assert.equal(campaignRuntimeErrors(draft,{...capabilities,campaign_hero:1}).length,0);
  draft.sections[0].layout="centered";
  assert.equal(campaignRuntimeErrors(draft,capabilities).length,0);
  draft.sections[0].settings.headline_size="display";
  assert.match(campaignRuntimeErrors(draft,capabilities)[0].message,/grands titres/);
  draft.sections[0].settings={card_presentation:"campaign"};draft.sections[0].section_type="menu_highlights";
  assert.match(campaignRuntimeErrors(draft,capabilities)[0].message,/cartes/);
  assert.equal(campaignRuntimeErrors(draft,{...capabilities,campaign_products:1}).length,0);
});
