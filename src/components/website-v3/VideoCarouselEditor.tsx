"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, controlClass } from "./controls";
import { ImageUploadField } from "./SectionContentEditors";
import { VideoUploadField } from "./VideoUploadField";
import { useCampaignCapability } from "./CampaignRuntimeContext";

type Reel = {
  id: string;
  title?: string;
  video_url?: string;
  poster_url?: string;
  cta_text?: string;
  cta_link?: string;
  source_url?: string;
};

const textFields = [
  ["title", "editorField_title"],
  ["cta_text", "editorField_cta_text"],
  ["cta_link", "editorField_cta_link"],
  ["source_url", "editorReelInstagramLink"],
] as const;

/** Edits video cards and their independent actions through the website draft. */
export function VideoCarouselEditor({ section, restaurantId, onChange }: {
  section: DraftSectionPayload;
  restaurantId: number;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const supported = useCampaignCapability("video_carousel");
  const value = section.content.reels;
  const reels: Reel[] = Array.isArray(value)
    ? value.filter((row): row is Reel => row && typeof row.id === "string")
    : [];
  const latest = useRef({ reels, onChange });
  const mounted = useRef(false);
  latest.current = { reels, onChange };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function save(next: Reel[]) {
    latest.current.reels = next;
    latest.current.onChange(["content", "reels"], next);
  }

  function update(id: string, patch: Partial<Reel>) {
    if (!mounted.current || !latest.current.reels.some(reel => reel.id === id)) return;
    save(latest.current.reels.map(reel => reel.id === id ? { ...reel, ...patch } : reel));
  }

  function move(id: string, step: number) {
    const next = [...latest.current.reels];
    const index = next.findIndex(reel => reel.id === id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  }

  return (
    <fieldset disabled={!supported} className="min-w-0 space-y-4">
      <legend className="text-sm font-semibold">{t("editorReels")}</legend>
      <p className="text-xs text-slate-600">{t(supported ? "editorReelsHint" : "editorReelsUnsupported")}</p>
      {reels.map((reel, index) => (
        <details key={reel.id} open={reels.length === 1 || undefined} className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{reel.title || `${t("editorVideo")} ${index + 1}`}</summary>
          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              <button type="button" className="sqe-icon-button" aria-label={t("editorMoveUp")} disabled={index === 0} onClick={() => move(reel.id, -1)}><ArrowUp size={16} /></button>
              <button type="button" className="sqe-icon-button" aria-label={t("editorMoveDown")} disabled={index === reels.length - 1} onClick={() => move(reel.id, 1)}><ArrowDown size={16} /></button>
              <button type="button" className="sqe-icon-button" aria-label={t("editorDelete")} onClick={() => save(latest.current.reels.filter(row => row.id !== reel.id))}><Trash2 size={16} /></button>
            </div>
            {textFields.map(([field, label]) => (
              <InspectorField key={field} label={t(label)}>
                <input
                  className={controlClass}
                  data-field-id={`section.content.reels.${index}.${field}`}
                  value={String(reel[field] ?? "")}
                  onChange={event => update(reel.id, { [field]: event.target.value })}
                />
              </InspectorField>
            ))}
            <ImageUploadField
              restaurantId={restaurantId}
              label={t("editorReelPoster")}
              fieldId={`section.content.reels.${index}.poster_url`}
              currentUrl={String(reel.poster_url ?? "")}
              onUploaded={poster_url => update(reel.id, { poster_url })}
              onRemove={() => update(reel.id, { poster_url: "" })}
            />
            <VideoUploadField
              restaurantId={restaurantId}
              fieldId={`section.content.reels.${index}.video_url`}
              currentUrl={String(reel.video_url ?? "")}
              posterUrl={String(reel.poster_url ?? "")}
              cover={false}
              onUploaded={video_url => update(reel.id, { video_url })}
              onRemove={() => update(reel.id, { video_url: "" })}
            />
          </div>
        </details>
      ))}
      <button type="button" className="sqe-button w-full" disabled={reels.length >= 12} onClick={() => save([...latest.current.reels, { id: crypto.randomUUID() }])}>
        <Plus size={16} />
        {t("editorVideoAdd")}
      </button>
    </fieldset>
  );
}
