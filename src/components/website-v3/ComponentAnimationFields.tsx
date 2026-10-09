"use client";
import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  COMPONENT_ENTRANCES,
  recommendedComponentMotion,
} from "@/lib/website-v3/component-motion";
import { InspectorField, ToggleField, controlClass } from "./controls";

/** Keeps animation options available for every section, including specialized inspectors. */
export function ComponentAnimationFields({
  section,
  onChange,
}: {
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const settings = section.settings;
  const storedMotion =
    settings.motion &&
    typeof settings.motion === "object" &&
    !Array.isArray(settings.motion)
      ? (settings.motion as Record<string, unknown>)
      : {};
  const intrinsicMotion =
    ["animated_text", "scrolling_text"].includes(section.section_type) ||
    (section.section_type === "testimonials" &&
      settings.carousel_autoplay === true);
  const motion: Record<string, unknown> = {
    ...(intrinsicMotion ? { enabled: true, entrance: "none" } : {}),
    ...storedMotion,
  };
  const hasButtons = ![
    "animated_text",
    "scrolling_text",
    "rss_feed",
    "embed",
  ].includes(section.section_type);
  const recommended = recommendedComponentMotion(section.section_type);
  const update = (key: string, value: unknown) =>
    onChange(["settings", "motion"], { ...motion, [key]: value });
  const hasMedia = [
    "hero_banner",
    "text_and_image",
    "gallery",
    "menu_highlights",
    "featured_menu",
    "featured_categories",
    "donation",
    "feature_cards",
    "about",
  ].includes(section.section_type);
  const entrances = COMPONENT_ENTRANCES.filter(
    (value) =>
      value !== "split" ||
      section.section_type === "text_and_image" ||
      (section.section_type === "hero_banner" && section.layout === "split"),
  );
  const select = (key: string, values: readonly string[], fallback: string) => (
    <InspectorField label={t(`editorMotion_${key}`)}>
      <select
        className={controlClass}
        data-field-id={`section.settings.motion.${key}`}
        value={String(motion[key] ?? fallback)}
        onChange={(event) => update(key, event.target.value)}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`editorMotionStyle_${value}`)}
          </option>
        ))}
      </select>
    </InspectorField>
  );
  const number = (
    key: string,
    min: number,
    max: number,
    step: number,
    fallback: number,
  ) => (
    <InspectorField
      label={`${t(`editorMotion_${key}`)} · ${Number(motion[key] ?? fallback)}${key.endsWith("parallax_amount") ? " px" : " ms"}`}
    >
      <input
        className="w-full accent-black"
        type="range"
        data-field-id={`section.settings.motion.${key}`}
        min={min}
        max={max}
        step={step}
        value={Number(motion[key] ?? fallback)}
        onChange={(event) => update(key, Number(event.target.value))}
      />
    </InspectorField>
  );
  return (
    <details
      className="border-t border-slate-100 px-5 py-5"
      key={section.id || section.tmp_id}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        {t("editorComponentAnimations")}
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs leading-5 text-slate-500">
          {t("editorMotionHelp")}
        </p>
        <ToggleField
          fieldId="section.settings.motion.enabled"
          label={t("editorMotionEnabled")}
          checked={motion.enabled === true}
          onChange={(enabled) =>
            onChange(["settings", "motion"], {
              ...recommended,
              ...motion,
              enabled,
            })
          }
        />
        <button
          className="sqe-button sqe-button-secondary w-full"
          onClick={() =>
            onChange(["settings"], {
              ...settings,
              motion: recommended,
              ...(section.section_type === "animated_text"
                ? {
                    word_animation: "swirl",
                    resize_width: true,
                    speed: "normal",
                  }
                : {}),
              ...(section.section_type === "testimonials"
                ? {
                    carousel_autoplay: true,
                    carousel_interval: 5000,
                    carousel_duration: 500,
                  }
                : {}),
            })
          }
        >
          {t("editorMotionPreset")}
        </button>
        {motion.enabled === true && (
          <>
            {select("entrance", entrances, "fade")}
            {number("duration_ms", 200, 3000, 50, 1250)}
            {number("delay_ms", 0, 3000, 100, 0)}
            <ToggleField
              fieldId="section.settings.motion.replay"
              label={t("editorMotion_replay")}
              checked={motion.replay === true}
              onChange={(value) => update("replay", value)}
            />
            {hasMedia &&
              select("media_hover", ["none", "wobble", "grow", "lift"], "none")}
            {hasButtons &&
              select("button_hover", ["none", "push", "grow", "lift"], "none")}
            {select("parallax", ["none", "up", "down"], "none")}
            {select("parallax_target", ["media", "text", "component"], "media")}
            {motion.parallax &&
              motion.parallax !== "none" &&
              number("parallax_amount", 10, 200, 5, 20)}
            <ToggleField
              fieldId="section.settings.motion.mobile"
              label={t("editorMotion_mobile")}
              checked={motion.mobile !== false}
              onChange={(value) => update("mobile", value)}
            />
            {motion.mobile !== false && (
              <>
                {select(
                  "mobile_entrance",
                  ["inherit", ...entrances],
                  "inherit",
                )}
                <ToggleField
                  fieldId="section.settings.motion.parallax_mobile"
                  label={t("editorMotion_parallax_mobile")}
                  checked={motion.parallax_mobile === true}
                  onChange={(value) => update("parallax_mobile", value)}
                />
                {motion.parallax_mobile === true && (
                  <>
                    {select(
                      "mobile_parallax",
                      ["inherit", "none", "up", "down"],
                      "inherit",
                    )}
                    {select(
                      "mobile_parallax_target",
                      ["inherit", "media", "text", "component"],
                      "inherit",
                    )}
                    {number(
                      "mobile_parallax_amount",
                      10,
                      200,
                      5,
                      Number(motion.parallax_amount ?? 20),
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {section.section_type === "testimonials" &&
          section.layout === "carousel" && (
            <>
              <ToggleField
                fieldId="section.settings.carousel_autoplay"
                label={t("editorMotionAutoplay")}
                checked={settings.carousel_autoplay === true}
                onChange={(value) =>
                  onChange(["settings", "carousel_autoplay"], value)
                }
              />
              <InspectorField label={t("editorMotionInterval")}>
                <input
                  className={controlClass}
                  type="number"
                  min={2000}
                  max={15000}
                  step={500}
                  data-field-id="section.settings.carousel_interval"
                  value={Number(settings.carousel_interval ?? 5000)}
                  onChange={(event) =>
                    onChange(
                      ["settings", "carousel_interval"],
                      Math.max(
                        2000,
                        Math.min(15000, Number(event.target.value)),
                      ),
                    )
                  }
                />
              </InspectorField>
              <InspectorField label={t("editorMotionTransition")}>
                <input
                  className={controlClass}
                  type="number"
                  min={100}
                  max={2000}
                  step={100}
                  data-field-id="section.settings.carousel_duration"
                  value={Number(settings.carousel_duration ?? 500)}
                  onChange={(event) =>
                    onChange(
                      ["settings", "carousel_duration"],
                      Math.max(100, Math.min(2000, Number(event.target.value))),
                    )
                  }
                />
              </InspectorField>
            </>
          )}
      </div>
    </details>
  );
}
