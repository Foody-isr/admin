"use client";
import { ColorStylePicker } from "./ColorStylePicker";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { MenuHighlightsAppearanceEditor } from "./MenuHighlightsAppearanceEditor";
import { getMenu, type MenuItem } from "@/lib/api";
import { useI18n, useCurrency } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  featuredPickerItems,
  moveFeaturedItem,
  toggleFeaturedItem,
} from "@/lib/website-v3/featured-items";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

/** Edits each featured section using its own item selection, layout and content controls. */
export function FeaturedItemsEditor({
  restaurantId,
  section,
  onChange,
}: {
  restaurantId: number;
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const menu = section.section_type === "featured_menu";
  const settings = section.settings;
  const content = section.content;
  const ids = Array.isArray(content.item_ids)
    ? content.item_ids.map(Number).filter(Number.isFinite)
    : [];
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [picker, setPicker] = useState(false);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [customize, setCustomize] = useState(true);
  const set = (key: string, value: unknown) =>
    onChange(["settings", key], value);
  const text = (key: string, value: string) =>
    onChange(["content", key], value);
  const bool = (key: string, fallback: boolean) =>
    typeof settings[key] === "boolean" ? (settings[key] as boolean) : fallback;
  const carousel = !menu && section.layout === "carousel";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setItems([]);
    getMenu(restaurantId)
      .then((menus) => {
        if (active) setItems(featuredPickerItems(menus));
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [restaurantId, retry]);

  const toggle = (key: string, label: string, fallback: boolean) => (
    <ToggleField
      key={key}
      fieldId={`section.settings.${key}`}
      label={t(label)}
      checked={bool(key, fallback)}
      onChange={(value) => set(key, value)}
    />
  );
  const input = (key: string, label: string) => (
    <InspectorField label={t(label)}>
      <input
        className={controlClass}
        value={String(content[key] ?? "")}
        onChange={(event) => text(key, event.target.value)}
      />
    </InspectorField>
  );
  const visibleItems = items.filter(
    (item) =>
      item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (availability !== "available" || item.availability_state !== "sold_out"),
  );
  const selectedItem = (id: number) =>
    items.find((item) => item.id === id)?.name ??
    `${t("featuredUnavailableItem")} (${id})`;

  return (
    <div className="sqe-featured-editor">
      <InspectorGroup title={t(menu ? "featuredMenuItems" : "featuredItems")}>
        {!menu && (
          <div>
            <select
              aria-label={t("featuredItems")}
              className={controlClass}
              value={
                settings.item_source === "popular"
                  ? "popular"
                  : settings.auto_select_items === true
                    ? "automatic"
                    : "custom"
              }
              onChange={(event) =>
                onChange(["settings"], {
                  ...settings,
                  item_source: event.target.value,
                  auto_select_items: event.target.value === "automatic",
                })
              }
            >
              <option value="custom">{t("featuredCustomSelection")}</option>
              <option value="popular">{t("featuredMostPopular")}</option>
              <option value="automatic">
                {t("featuredAutomaticSelection")}
              </option>
            </select>
          </div>
        )}
        <p className="sqe-featured-help">
          {t(
            menu
              ? "featuredMenuHelp"
              : settings.item_source === "popular"
                ? "featuredPopularHelp"
                : settings.auto_select_items === true
                  ? "featuredAutomaticHelp"
                  : "featuredSelectionHelp",
          )}
        </p>
        {(settings.auto_select_items !== true &&
          settings.item_source !== "popular") ||
        menu ? (
          <>
            <button
              className="sqe-button sqe-button-secondary w-full"
              onClick={() => {
                setDraftIds(ids);
                setQuery("");
                setPicker(true);
              }}
            >
              {t(menu ? "featuredChooseMenuItems" : "featuredChooseItems")}
            </button>
            {ids.length > 0 && (
              <ol className="sqe-featured-selected">
                {ids.map((id, index) => (
                  <li key={id}>
                    <span>{selectedItem(id)}</span>
                    <button
                      aria-label={`${t("featuredMoveUp")} ${selectedItem(id)}`}
                      disabled={index === 0}
                      onClick={() =>
                        onChange(
                          ["content", "item_ids"],
                          moveFeaturedItem(ids, index, -1),
                        )
                      }
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label={`${t("featuredMoveDown")} ${selectedItem(id)}`}
                      disabled={index === ids.length - 1}
                      onClick={() =>
                        onChange(
                          ["content", "item_ids"],
                          moveFeaturedItem(ids, index, 1),
                        )
                      }
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      aria-label={`${t("featuredRemove")} ${selectedItem(id)}`}
                      onClick={() =>
                        onChange(
                          ["content", "item_ids"],
                          ids.filter((value) => value !== id),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <InspectorField label={t("featuredMaximum")}>
            <select
              className={controlClass}
              value={Number(settings.max_items ?? 10)}
              onChange={(event) => set("max_items", Number(event.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1}>{index + 1}</option>
              ))}
            </select>
          </InspectorField>
        )}
      </InspectorGroup>
      <button
        className="sqe-customize-toggle"
        aria-expanded={customize}
        onClick={() => setCustomize((value) => !value)}
      >
        {t("editorCustomize")}
        <ChevronDown
          size={18}
          style={{ transform: customize ? "rotate(180deg)" : undefined }}
        />
      </button>
      {customize && (
        <>
          <InspectorGroup title={t("editorLayoutColor")}>
            <div className="sqe-layout-picker">
              <span>{t("editorLayout")}</span>
              <div className="sqe-layout-choices">
                {(menu ? ["list"] : ["grid", "carousel"]).map((layout) => (
                  <button
                    key={layout}
                    className="sqe-layout-choice sqe-featured-layout"
                    aria-label={t(
                      layout === "list"
                        ? "featuredMenuCards"
                        : `editorLayout_${layout}`,
                    )}
                    aria-pressed={
                      menu ||
                      (section.layout === "carousel" ? "carousel" : "grid") ===
                        layout
                    }
                    onClick={() => onChange(["layout"], layout)}
                  >
                    <span
                      className={`sqe-featured-mini sqe-featured-mini--${layout}`}
                      aria-hidden="true"
                    >
                      <b />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {carousel ? (
              <div className="sqe-choice-field">
                <span>{t("featuredImageSize")}</span>
                <div className="sqe-segmented">
                  {["S", "M", "L"].map((size) => (
                    <button
                      key={size}
                      aria-label={`${t("featuredImageSize")} ${size}`}
                      aria-pressed={(settings.image_size ?? "L") === size}
                      onClick={() => set("image_size", size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <InspectorField label={t("featuredColumns")}>
                <select
                  className={controlClass}
                  value={Number(settings.columns ?? (menu ? 2 : 3))}
                  onChange={(event) =>
                    set("columns", Number(event.target.value))
                  }
                >
                  {Array.from({ length: menu ? 2 : 4 }, (_, index) => (
                    <option key={index + 1}>{index + 1}</option>
                  ))}
                </select>
              </InspectorField>
            )}
            {!menu && (
              <>
                <InspectorField label={t("featuredSpacing")}>
                  <div className="sqe-featured-range">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={Number(settings.column_spacing ?? 2)}
                      onChange={(event) =>
                        set("column_spacing", Number(event.target.value))
                      }
                    />
                    <output>{Number(settings.column_spacing ?? 2)}</output>
                  </div>
                </InspectorField>
                {toggle("full_width", "featuredFullWidth", false)}
              </>
            )}
            {carousel && (
              <>
                {toggle("auto_scroll", "featuredAutoScroll", false)}
                {bool("auto_scroll", false) && (
                  <>
                    <InspectorField label={t("featuredSpeed")}>
                      <div className="sqe-segmented">
                        {[0.5, 1, 1.5, 2].map((speed) => (
                          <button
                            key={speed}
                            aria-label={`${t("featuredSpeed")} ${speed}x`}
                            aria-pressed={
                              Number(settings.scroll_speed ?? 1) === speed
                            }
                            onClick={() => set("scroll_speed", speed)}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </InspectorField>
                    <InspectorField label={t("featuredDirection")}>
                      <div className="sqe-segmented">
                        {["left", "right"].map((direction) => (
                          <button
                            key={direction}
                            aria-label={t(`editorAlign_${direction}`)}
                            aria-pressed={
                              (settings.scroll_direction ?? "left") ===
                              direction
                            }
                            onClick={() => set("scroll_direction", direction)}
                          >
                            {direction === "left" ? (
                              <ArrowLeft size={20} />
                            ) : (
                              <ArrowRight size={20} />
                            )}
                          </button>
                        ))}
                      </div>
                    </InspectorField>
                  </>
                )}
              </>
            )}
            <ColorStylePicker custom value={String(settings.color_style ?? "default")} onChange={id => onChange(["settings"], {...settings, color_style: id, custom_bg: "", custom_text: ""})} />
            {settings.color_style === "custom" && (
              <>
                <ColorField
                  fieldId="section.settings.custom_bg"
                  label={t("websiteV3HighlightsSectionBackground")}
                  value={String(settings.custom_bg ?? "")}
                  fallback="#ffffff"
                  onChange={(value) => set("custom_bg", value)}
                />
                <ColorField
                  fieldId="section.settings.custom_text"
                  label={t("websiteV3HighlightsSectionText")}
                  value={String(settings.custom_text ?? "")}
                  fallback="#111111"
                  onChange={(value) => set("custom_text", value)}
                />
              </>
            )}
            <details className="sqe-featured-lightbox">
              <summary>{t("editorColor_custom")}</summary>
              <MenuHighlightsAppearanceEditor
                value={settings}
                onChange={onChange}
              />
            </details>
          </InspectorGroup>
          <InspectorGroup title={t("editorContent")}>
            {toggle("show_title", "featuredSectionTitle", true)}
            {bool("show_title", true) && input("title", "featuredSectionTitle")}
            {toggle("show_subtitle", "featuredSectionDescription", true)}
            {bool("show_subtitle", true) &&
              input("subtitle", "featuredSectionDescription")}
            {toggle("show_cta_text", "featuredSectionButton", menu)}
            {bool("show_cta_text", menu) && (
              <>
                {input("cta_text", "editorButton")}
                {input("cta_link", "featuredButtonLink")}
              </>
            )}
            {toggle("show_images", "featuredImages", !menu)}
            {bool("show_images", !menu) && (
              <>
                <InspectorField label={t("featuredImageRatio")}>
                  <select
                    className={controlClass}
                    value={String(settings.image_ratio ?? "1/1")}
                    onChange={(event) => set("image_ratio", event.target.value)}
                  >
                    {["1/1", "3/2", "2/3", "4/3"].map((ratio) => (
                      <option key={ratio}>{ratio}</option>
                    ))}
                  </select>
                </InspectorField>
                <InspectorField label={t("featuredImageFit")}>
                  <select
                    className={controlClass}
                    value={String(settings.image_fit ?? "cover")}
                    onChange={(event) => set("image_fit", event.target.value)}
                  >
                    <option value="cover">{t("featuredCover")}</option>
                    <option value="contain">{t("featuredContain")}</option>
                  </select>
                </InspectorField>
              </>
            )}
            {toggle("show_item_titles", "featuredItemTitles", true)}
            {toggle("show_descriptions", "featuredItemDescriptions", menu)}
            {toggle("show_prices", "featuredPrices", true)}
            {toggle("show_badges", "featuredBadges", true)}
            {!menu && (
              <>
                {toggle("show_buttons", "featuredButtons", true)}
                {bool("show_buttons", true) &&
                  input("item_button_text", "editorButton")}
              </>
            )}
            <details className="sqe-featured-lightbox">
              <summary>{t("featuredLightbox")}</summary>
              <p>{t("featuredLightboxHelp")}</p>
              <a
                href={`/${restaurantId}/menu/items`}
                className="sqe-button sqe-button-secondary"
              >
                {t("featuredItemLibrary")}
              </a>
            </details>
          </InspectorGroup>
        </>
      )}
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="sm:max-w-5xl max-h-[90dvh] p-8 text-black bg-white">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>
              {t(menu ? "featuredSelectMenuItems" : "featuredSelectItems")}
            </DialogTitle>
            <button
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
              onClick={() => {
                onChange([], {
                  ...section,
                  content: { ...content, item_ids: draftIds },
                  settings: {
                    ...settings,
                    auto_select_items: false,
                    item_source: "custom",
                  },
                });
                setPicker(false);
              }}
            >
              {t("featuredSave")}
            </button>
          </div>
          <DialogDescription>{t("featuredSelectionHelp")}</DialogDescription>
          <div className="flex gap-3">
            <label className="flex flex-1 items-center gap-3 rounded-full border border-neutral-300 px-4">
              <Search size={20} />
              <input
                className="h-12 w-full outline-none bg-transparent"
                placeholder={t("featuredSearch")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label={t("featuredVisibility")}
              className="rounded-lg border border-neutral-300 px-4"
              value={availability}
              onChange={(event) => setAvailability(event.target.value)}
            >
              <option value="all">{t("featuredAllItems")}</option>
              <option value="available">{t("featuredAvailable")}</option>
            </select>
          </div>
          {loading ? (
            <p role="status">{t("featuredLoading")}</p>
          ) : loadError ? (
            <div role="alert">
              <p>{t("featuredLoadError")}</p>
              <button onClick={() => setRetry((value) => value + 1)}>
                {t("featuredRetry")}
              </button>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-400">
                    <th className="p-4 text-start">{t("featuredItems")}</th>
                    <th className="p-4 text-start">
                      {t("featuredVisibility")}
                    </th>
                    <th className="p-4 text-end">{t("featuredPrices")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr className="border-b border-neutral-200" key={item.id}>
                      <td className="p-4">
                        <label className="flex items-center gap-4 selection-row">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-black"
                            checked={draftIds.includes(item.id)}
                            onChange={() =>
                              setDraftIds((value) =>
                                toggleFeaturedItem(value, item.id),
                              )
                            }
                          />
                          {item.name}
                        </label>
                      </td>
                      <td className="p-4">
                        {t(
                          item.availability_state === "sold_out"
                            ? "featuredSoldOut"
                            : "featuredAvailable",
                        )}
                      </td>
                      <td className="p-4 text-end">{money(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleItems.length === 0 && (
                <p className="py-8 text-center">{t("featuredNoItems")}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
