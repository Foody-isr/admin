"use client";

import {useEffect,useState} from "react";
import type {MenuItem} from "@/lib/api";
import {useI18n} from "@/lib/i18n";
import {normalizeFeaturedImageBackgrounds} from "@/lib/website-v3/featured-items";
import {ColorField, InspectorField, controlClass} from "./controls";

/** Edits each featured product's image surface without changing catalogue imagery. */
export function ItemImageBackgroundEditor({items, value, fallback, alternateFallback, onChange}: {
  items: MenuItem[]; value: unknown; fallback: string; alternateFallback?: string; onChange: (value: Record<string, string>) => void;
}) {
  const {t} = useI18n();
  const [selected, setSelected] = useState("");
  const item = items.find(item => String(item.id) === selected) || items[0];
  const colors = normalizeFeaturedImageBackgrounds(value);
  const authored = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const savedColor = item && typeof authored[item.id] === "string" ? authored[item.id] as string : "";
  const [draftColor,setDraftColor]=useState<{itemId:number;text:string}|null>(null);
  useEffect(()=>setDraftColor(null),[item?.id,savedColor]);
  if (!item) return null;
  return <fieldset data-field-id="section.settings.item_image_backgrounds" className="min-w-0 space-y-3" onBlur={event=>{
    if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDraftColor(null);
  }}>
    <legend className="text-sm font-medium">{t("featuredItemBackgrounds")}</legend>
    <InspectorField label={t("featuredBackgroundProduct")}><select className={controlClass} value={String(item.id)} onChange={event => setSelected(event.target.value)}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></InspectorField>
    <ColorField fieldId={`section.settings.item_image_backgrounds.${item.id}`} label={t("campaignImageBackground")} value={draftColor?.itemId===item.id ? draftColor.text : savedColor} fallback={items.indexOf(item) % 2 && alternateFallback ? alternateFallback : fallback} onChange={color => {
      setDraftColor({itemId:item.id,text:color});
      if(color && !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color))return;
      const next = {...colors};
      if (color) next[item.id] = color;
      else delete next[item.id];
      onChange(next);
    }}/>
    <button type="button" className="sqe-text-button" data-field-id="section.featured.reset_item_background" disabled={!Object.prototype.hasOwnProperty.call(authored,item.id)} onClick={() => {
      setDraftColor(null);
      const next={...colors}; delete next[item.id]; onChange(next);
    }}>{t("featuredResetItemBackground")}</button>
  </fieldset>;
}
