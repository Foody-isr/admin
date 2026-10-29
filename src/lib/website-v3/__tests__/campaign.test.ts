import assert from "node:assert/strict";
import test from "node:test";
import { campaignSlidesForSection, normalizeCampaignSection, normalizeCampaignSlides } from "../campaign";
import { campaignRuntimeErrors, type WebsiteV3RuntimeCapabilities } from "../runtime-capabilities";
import { normalizeDraftState } from "../state";
import { normalizeWebsiteHeader } from "../header";

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

test("optional layout controls clamp authored values without materializing new legacy defaults", () => {
  const original = state().sections[0];
  for (const key of ["controls_alignment", "show_counter", "card_width_percent", "card_gap"]) assert.equal(key in original.settings, false);
  const next = normalizeCampaignSection({...original,settings:{controls_alignment:"invalid",show_counter:false,show_playback_control:false,card_width_percent:150,card_width_percent_mobile:5,card_gap:0}});
  assert.equal(next.settings.controls_alignment,"center");
  assert.equal(next.settings.card_width_percent,100);
  assert.equal(next.settings.card_width_percent_mobile,70);
  assert.equal(next.settings.card_gap,0);
  assert.equal(next.settings.show_counter,false);
  assert.equal(next.settings.show_playback_control,false);
  assert.equal("card_gap" in normalizeCampaignSection({...original,settings:{card_gap:undefined}}).settings,false);
  const grid = normalizeCampaignSection({...original,section_type:"menu_highlights",layout:"grid",settings:{card_presentation:"campaign",content_max_width:9999,row_spacing:-9,item_image_backgrounds:{"1":"#abc","12":"#ffb9cd","0":"#000000","bad":"#fff","3":"url(unsafe)"}}});
  assert.equal(grid.settings.content_max_width,1800);
  assert.equal(grid.settings.row_spacing,0);
  assert.deepEqual(grid.settings.item_image_backgrounds,{"1":"#abc","12":"#ffb9cd"});
});

test("layout capability gates authored hero, grid and hamburger options without blocking legacy headers", () => {
  const draft = state();
  const oldCapabilities = {campaign_hero:1,campaign_products:1,display_typography:1} as WebsiteV3RuntimeCapabilities;
  draft.config.nav_layout={header:normalizeWebsiteHeader({})};
  assert.deepEqual(campaignRuntimeErrors(draft,oldCapabilities),[]);
  draft.sections[0].settings={controls_alignment:"center",show_counter:true,show_playback_control:true,card_width_percent:92,card_width_percent_mobile:90};
  assert.deepEqual(campaignRuntimeErrors(draft,oldCapabilities),[]);
  draft.sections[0].settings={show_counter:false};
  assert.equal(campaignRuntimeErrors(draft,oldCapabilities).length,1);
  assert.deepEqual(campaignRuntimeErrors(draft,{...oldCapabilities,campaign_layout_controls:1}),[]);
  draft.sections[0].settings={};
  draft.config.nav_layout={header:normalizeWebsiteHeader({navigation:{hamburger_style:"staggered",hamburger_stroke:2.5}})};
  assert.equal(campaignRuntimeErrors(draft,oldCapabilities)[0].fieldId,"site.header.navigation.hamburger_style");
  draft.config.nav_layout={header:normalizeWebsiteHeader({})};
  draft.sections[0]={...draft.sections[0],section_type:"menu_highlights",layout:"grid",settings:{card_presentation:"campaign",item_image_backgrounds:{"12":"#abcdef"}}};
  assert.equal(campaignRuntimeErrors(draft,oldCapabilities).length,1);
  draft.sections[0].is_visible=false;
  assert.deepEqual(campaignRuntimeErrors(draft,oldCapabilities),[]);
});
