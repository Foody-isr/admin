"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {useEffect,useRef} from "react";
import { useI18n } from "@/lib/i18n";
import { campaignSlidesForSection, MAX_CAMPAIGN_SLIDES, type CampaignSlide } from "@/lib/website-v3/campaign";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { ImageUploadField } from "./SectionContentEditors";
import { ImageFramingControl } from "./ImageFramingControl";
import { VideoUploadField } from "./VideoUploadField";
import { ColorField, InspectorField, ToggleField, controlClass } from "./controls";
import { useCampaignCapability } from "./CampaignRuntimeContext";
import {BoundedNumberInput} from "./BoundedNumberInput";

/** Edits campaign slides using the same draft payload consumed by preview and publication. */
export function CampaignSlidesEditor({restaurantId, section, onChange, selectedSlide}: {
  restaurantId: number; section: DraftSectionPayload; selectedSlide?: number; onChange: (path: StatePath, value: unknown) => void;
}) {
  const {t} = useI18n();
  const supported = useCampaignCapability("campaign_hero");
  const displaySupported = useCampaignCapability("display_typography");
  const layoutSupported = useCampaignCapability("campaign_layout_controls");
  const slides = campaignSlidesForSection(section);
  const identity=String(section.id ?? section.tmp_id);
  const latest=useRef({slides,identity,onChange});
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  latest.current={slides,identity,onChange};
  const save = (next: CampaignSlide[]) => onChange(["content", "slides"], next);
  const update = (index: number, change: Partial<CampaignSlide>) => {
    const id=slides[index]?.id;
    // Media uploads may finish after a reorder or a different section is opened.
    if (!mounted.current || !id || latest.current.identity !== identity || !latest.current.slides.some(slide => slide.id === id)) return;
    latest.current.onChange(["content","slides"],latest.current.slides.map(slide => slide.id === id ? {...slide,...change} : slide));
  };
  const move = (index: number, direction: number) => {
    const next = [...slides], target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };
  return <fieldset disabled={!supported} className="min-w-0 space-y-5">
    <legend className="text-sm font-semibold">{t("campaignSlides")}</legend>
    {!supported && <p role="status" className="text-xs">{t("campaignRuntimeUnavailable")}</p>}
    <p className="text-xs text-slate-500">{t("campaignSlidesHelp")}</p>
    <InspectorField label={t("editorTextStyle")}><select className={controlClass} data-field-id="section.settings.headline_size" value={String(section.settings.headline_size || "md")} onChange={event => onChange(["settings","headline_size"],event.target.value)}>{["sm","md","lg","xl","display"].map(size => <option key={size} value={size} disabled={size === "display" && !displaySupported}>{t(`editorSize_${size}`)}</option>)}</select></InspectorField>
    {slides.map((slide, index) => <details key={slide.id} open={slides.length === 1 || selectedSlide === index || undefined} className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t("campaignSlide")} {index + 1}{slide.headline ? ` · ${slide.headline}` : ""}</summary>
      <div className="mt-4 space-y-4" data-campaign-slide={slide.id}>
        <div className="flex gap-2">
          <button type="button" className="sqe-icon-button" aria-label={`${t("editorMoveUp")} ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16}/></button>
          <button type="button" className="sqe-icon-button" aria-label={`${t("editorMoveDown")} ${index + 1}`} disabled={index === slides.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16}/></button>
          <button type="button" className="sqe-icon-button" aria-label={`${t("campaignDeleteSlide")} ${index + 1}`} disabled={slides.length === 1} onClick={() => save(slides.filter((_, i) => i !== index))}><Trash2 size={16}/></button>
        </div>
        {([['headline','editorHeadline'],['subheadline','editorText'],['image_alt','campaignImageAlt'],['cta_text','editorButton'],['cta_link','editorLink']] as const).map(([key,label]) => <InspectorField key={key} label={t(label)}><input className={controlClass} data-field-id={`section.content.slides.${index}.${key}`} value={slide[key]} onChange={event => update(index, {[key]: event.target.value})}/></InspectorField>)}
        <ImageUploadField restaurantId={restaurantId} label={t("editorBackgroundMedia")} fieldId={`section.content.slides.${index}.image_url`} currentUrl={slide.image_url} framing={slide.image_framing} onFramingChange={value => update(index,{image_framing:value})} onUploaded={url => update(index,{image_url:url,video_url:""})} onRemove={() => update(index,{image_url:""})}/>
        <VideoUploadField restaurantId={restaurantId} fieldId={`section.content.slides.${index}.video_url`} currentUrl={slide.video_url} posterUrl={slide.image_url} onUploaded={url => update(index,{video_url:url})} onRemove={() => update(index,{video_url:""})}/>
        {slide.video_url && slide.image_url && <InspectorField label={t("campaignVideoFraming")}><ImageFramingControl src={slide.image_url} value={slide.video_framing} onChange={value => update(index,{video_framing:value})}/></InspectorField>}
        <ColorField fieldId={`section.content.slides.${index}.background_color`} label={t("campaignSlideBackground")} value={slide.background_color} fallback="#ffb9cd" onChange={value => update(index,{background_color:value})}/>
      </div>
    </details>)}
    <button type="button" className="sqe-button w-full" disabled={slides.length >= MAX_CAMPAIGN_SLIDES} onClick={() => save([...slides, {...slides[0],id:`slide-${crypto.randomUUID()}`,headline:"",subheadline:"",video_url:""}])}><Plus size={16}/>{t("campaignAddSlide")}</button>
    <ToggleField fieldId="section.settings.autoplay" label={t("campaignAutoplay")} checked={section.settings.autoplay === true} onChange={value => onChange(["settings","autoplay"],value)}/>
    <InspectorField label={t("campaignDuration")}><BoundedNumberInput fieldId="section.settings.slide_duration_seconds" min={5} max={30} value={Number(section.settings.slide_duration_seconds) || 10} onChange={value=>onChange(["settings","slide_duration_seconds"],value)}/></InspectorField>
    <InspectorField label={t("campaignImageFit")}><select className={controlClass} data-field-id="section.settings.image_fit" value={String(section.settings.image_fit || "cover")} onChange={event => onChange(["settings","image_fit"],event.target.value)}><option value="cover">{t("campaignCover")}</option><option value="contain">{t("campaignContain")}</option></select></InspectorField>
    <fieldset disabled={!layoutSupported} className="min-w-0 space-y-4">
      <legend className="text-sm font-semibold">{t("campaignLayoutControls")}</legend>
      {!layoutSupported && <p role="status" className="text-xs">{t("campaignRuntimeUnavailable")}</p>}
      <InspectorField label={t("campaignControlsAlignment")}><select className={controlClass} data-field-id="section.settings.controls_alignment" value={String(section.settings.controls_alignment || "center")} onChange={event => onChange(["settings", "controls_alignment"], event.target.value)}>{["left", "center", "right"].map(value => <option key={value} value={value}>{t(`editorAlign_${value}`)}</option>)}</select></InspectorField>
      <ToggleField fieldId="section.settings.show_counter" label={t("campaignShowCounter")} checked={section.settings.show_counter !== false} onChange={value => onChange(["settings", "show_counter"], value)}/>
      <ToggleField fieldId="section.settings.show_playback_control" label={t("campaignShowPlayback")} checked={section.settings.show_playback_control !== false} onChange={value => onChange(["settings", "show_playback_control"], value)}/>
      {section.settings.autoplay === true && <p className="text-xs text-slate-500">{t("campaignPlaybackSafeguard")}</p>}
      {([
        ["card_width_percent", "campaignCardWidth", 70, 100, 92],
        ["card_width_percent_mobile", "campaignCardWidthMobile", 70, 100, 90],
        ["card_gap", "campaignCardGap", 0, 64, 24],
      ] as const).map(([key, label, min, max, fallback]) => <InspectorField key={key} label={t(label)}><BoundedNumberInput fieldId={`section.settings.${key}`} min={min} max={max} integer={key==="card_gap"} value={Number(section.settings[key] ?? fallback)} onChange={value=>onChange(["settings",key],value)}/></InspectorField>)}
      {section.settings.card_gap !== undefined && <button type="button" className="sqe-text-button" onClick={() => onChange(["settings", "card_gap"], undefined)}>{t("campaignResetGap")}</button>}
    </fieldset>
  </fieldset>;
}
