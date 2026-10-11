"use client";
import { BooleanInput } from '@/components/ds/Selection';
import { ColorStylePicker, openSiteColors, type SiteColorEditTarget } from "./ColorStylePicker";
import {
  selectOrderColorStyle,
  previousOrderPresentation,
  previousItemPresentation,
} from "@/lib/website-v3/order-design";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { DraftPagePayload, StatePath } from "@/lib/website-v3/types";
import type { OrderEditorRegion } from "@/lib/website-v3/editor-selection";
import { record } from "@/lib/website-v3/restaurant-themes";
import { ImageUploadField } from "./SectionContentEditors";

/** Edits the same page-local order blocks rendered by the public order page. */
export function OrderPageEditor({
  restaurantId,
  page,
  region,
  onChange,
  onPreviewItem,
  sharedHeader = false,
  restaurantHeader = false,
  orderChoicesAvailable = true,
  onEditHeader,
}: {
  restaurantId: number;
  page: DraftPagePayload;
  region: OrderEditorRegion;
  onChange: (path: StatePath, value: unknown) => void;
  onPreviewItem: (open: boolean) => void;
  sharedHeader?: boolean;
  restaurantHeader?: boolean;
  orderChoicesAvailable?: boolean;
  onEditHeader?: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => () => onPreviewItem(false), [onPreviewItem]);
  const value = record(page.appearance_overrides.website_order);
  const set = (key: string, next: unknown) =>
    onChange(["appearance_overrides", "website_order", key], next);
  const editMenuColors = (menuGroup: SiteColorEditTarget["menuGroup"]) => (
    <button type="button" className="sqe-button sqe-button--outline"
      onClick={() => openSiteColors({ styleId: String(value.color_style ?? "default"), menuGroup })}>
      {t("editorEditMenuColors")}
    </button>
  );
  const toggle = (key: string, label: string, fallback = true) => (
    <label className="sqe-order-toggle" key={key}>
      <span>{t(label)}</span>
      <BooleanInput
        checked={
          typeof value[key] === "boolean" ? (value[key] as boolean) : fallback
        }
        onChange={(event) => set(key, event.target.checked)}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    fallback: string,
    options: readonly (readonly [string, string])[],
  ) => (
    <label className="sqe-field" key={key}>
      {t(label)}
      <select
        value={String(value[key] ?? fallback)}
        onChange={(event) => set(key, event.target.value)}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {t(text)}
          </option>
        ))}
      </select>
    </label>
  );
  const typography = (prefix: string, fallback: string) => (
    <>
      <label className="sqe-field">
        {t("editorTextStyle")}
        <select
          value={String(value[`${prefix}_style`] ?? fallback)}
          onChange={(event) => set(`${prefix}_style`, event.target.value)}
        >
          <option value="inherit">{t("editorOrderInherited")}</option>
          {[1, 2, 3, 4].map((level) => (
            <option key={`title-${level}`} value={`title-${level}`}>
              {t("editorField_title")} {level}
            </option>
          ))}
          {[1, 2, 3].map((level) => (
            <option key={`paragraph-${level}`} value={`paragraph-${level}`}>
              {t("editorOrderParagraph")} {level}
            </option>
          ))}
        </select>
      </label>
      {!(
        prefix === "category_title" && value[`${prefix}_style`] === "inherit"
      ) && (
        <>
          {select(`${prefix}_alignment`, "editorAlignment", "start", [
            ["start", "editorAlign_left"],
            ["center", "editorAlign_center"],
            ["end", "editorAlign_right"],
          ])}
          {toggle(`${prefix}_caps`, "editorOrderAllCaps", false)}
        </>
      )}
      {value[`${prefix}_style`] !== "inherit" &&
        select(
          `${prefix}_weight`,
          "editorOrderTextWeight",
          String(value[`${prefix}_style`] ?? fallback).startsWith("title")
            ? "semibold"
            : "regular",
          [
            ["regular", "editorOrderWeightRegular"],
            ["semibold", "editorOrderWeightSemibold"],
            ["bold", "editorOrderWeightBold"],
          ],
        )}
    </>
  );
  if (region === "order-banner" && restaurantHeader) return <div className="sqe-panel-body"><button className="sqe-button" onClick={onEditHeader}>{t("editorHeader")}</button></div>;
  if (region === "order-banner")
    return (
      <div className="sqe-panel-body sqe-order-settings">
        {toggle("show_banner", "editorShowBanner")}
        <ImageUploadField
          restaurantId={restaurantId}
          label={t("editorBackgroundMedia")}
          currentUrl={String(page.appearance_overrides.cover_url ?? "")}
          onUploaded={(url) =>
            onChange(["appearance_overrides", "cover_url"], url)
          }
          onRemove={() => onChange(["appearance_overrides", "cover_url"], "")}
        />
        {select("banner_height", "editorHeight", "medium", [
          ["small", "editorSizeSmall"],
          ["medium", "editorSizeMedium"],
          ["large", "editorSizeLarge"],
        ])}
        {toggle("show_title", "editorRestaurantName", false)}
      </div>
    );
  if (region === "order-fulfillment")
    return (
      <div className="sqe-panel-body sqe-order-settings">
        {sharedHeader ? (
          <button className="sqe-button" onClick={onEditHeader}>
            {t("editorHeader")}
          </button>
        ) : (
          toggle("show_fulfillment", "editorOrderShowService")
        )}
        {orderChoicesAvailable && <>
        {toggle("prompt_on_entry", "editorOrderPrompt")}
        {toggle("modal_cover", "editorOrderModalCover")}
        {toggle("modal_logo", "editorLogo")}
        </>}
        <p>{t("editorOrderServicesHint")}</p>
        <a className="sqe-button" href={`/${restaurantId}/settings`}>
          {t("editorSettings")}
        </a>
      </div>
    );
  return (
    <div className="sqe-order-settings">
      <div className="sqe-panel-body">
        <p>{t("editorOrderItemsHint")}</p>
        <a
          className="sqe-button sqe-order-view-items"
          href={`/${restaurantId}/menu/items`}
        >
          {t("editorViewItems")}
        </a>
        <button
          type="button"
          className="sqe-button sqe-button--outline"
          onClick={() =>
            onChange(
              ["appearance_overrides", "website_order"],
              previousOrderPresentation(value),
            )
          }
        >
          {t("editorOrderUseExistingStyle")}
        </button>
        <p>{t("editorOrderUseExistingStyleHint")}</p>
      </div>
      <div className="sqe-order-customize">
        <h3>{t("editorCustomize")}</h3>
        <details open>
          <summary>{t("editorLayoutColor")}</summary>
          <label>{t("editorLayout")}</label>
          <div className="sqe-order-layouts">
            {["list", "grid", "cards", "text", "single"].map((layout) => (
              <button
                key={layout}
                aria-label={t(`editorOrderLayout_${layout}`)}
                aria-pressed={(value.layout ?? "list") === layout}
                onClick={() => set("layout", layout)}
              >
                <span data-layout={layout}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          {select("columns", "editorDesktopColumns", "2", [
            ["1", "1"],
            ["2", "2"],
            ["3", "3"],
            ["4", "4"],
          ])}
          {select("content_width", "editorOrderContentWidth", "standard", [
            ["standard", "editorOrderWidthStandard"],
            ["wide", "editorOrderWidthWide"],
          ])}
          <ColorStylePicker
            menuGroup="list"
            value={String(value.color_style ?? "default")}
            onChange={(id) =>
              onChange(
                ["appearance_overrides", "website_order"],
                selectOrderColorStyle(value, id),
              )
            }
          />
          <p>{t("editorOneMenuColorStyle")}</p>
          {select("background_kind", "editorBackground", "style", [
            ["style", "editorOrderColorStyle"],
            ["image", "editorField_image_url"],
          ])}
          {value.background_kind === "image" && (
            <ImageUploadField
              restaurantId={restaurantId}
              label={t("editorBackgroundMedia")}
              currentUrl={String(value.background_image ?? "")}
              onUploaded={(url) => set("background_image", url)}
              onRemove={() => set("background_image", "")}
            />
          )}
        </details>
        <h3>{t("editorContent")}</h3>
        <details>
          <summary>{t("editorCategoryMenu")}</summary>
          {toggle("show_categories", "editorCategoryMenu")}
          {typography("category", "paragraph-3")}
          {select("category_shape", "editorShape", "plain", [
            ["plain", "editorNone"],
            ["rounded", "editorShapeRound"],
            ["pill", "editorOrderShapePill"],
          ])}
          {toggle("sticky_categories", "editorOrderStickyCategories", false)}
          {editMenuColors("categories")}
          <p>{t("editorOrderCategoryColorsHint")}</p>
        </details>
        {toggle("show_search", "editorOrderSearch")}
        {toggle("show_availability_filter", "editorOrderAvailabilityFilter")}
        {toggle("show_category_titles", "editorCategoryTitles")}
        {value.show_category_titles !== false && (
          <details>
            <summary>{t("editorCategoryTitleStyle")}</summary>
            {typography("category_title", "title-3")}
          </details>
        )}
        <details>
          <summary>{t("editorItemCards")}</summary>
          {select("card_style", "editorCardSpacing", "plain", [
            ["plain", "editorCardSpacingCompact"],
            ["filled", "editorCardSpacingComfortable"],
          ])}
          {editMenuColors("cards")}
          <p>{t("editorOrderCardColorsHint")}</p>
          {select("card_border", "editorBorder", "none", [
            ["none", "editorNone"],
            ["line", "editorOrderBorderLine"],
          ])}
          {select("card_radius", "editorShape", "square", [
            ["square", "editorShapeSquare"],
            ["soft", "editorOrderShapeSoft"],
            ["rounded", "editorShapeRound"],
          ])}
        </details>
        <details>
          <summary>{t("editorItemImages")}</summary>
          {toggle("show_images", "editorItemImages")}
          {select("image_ratio", "editorImageRatio", "square", [
            ["square", "editorShapeSquare"],
            ["landscape", "editorLandscape"],
            ["portrait", "editorPortrait"],
          ])}
          {select("image_fit", "editorImageFit", "cover", [
            ["cover", "editorImageFill"],
            ["contain", "editorImageContain"],
          ])}
          {select("image_radius", "editorShape", "square", [
            ["square", "editorShapeSquare"],
            ["soft", "editorOrderShapeSoft"],
            ["rounded", "editorShapeRound"],
          ])}
          {select("item_action", "editorOrderAddButton", "none", [
            ["none", "editorOrderWholeCard"],
            ["cutout", "editorOrderCutout"],
          ])}
        </details>
        <details>
          <summary>{t("editorItemTitles")}</summary>
          {toggle("show_item_titles", "editorItemTitles")}
          {typography("item_title", "paragraph-2")}
        </details>
        <details>
          <summary>{t("editorItemPrices")}</summary>
          {toggle("show_prices", "editorItemPrices")}
          {select("price_display", "editorOrderPriceDisplay", "range", [
            ["range", "editorOrderPriceRange"],
            ["starting", "editorOrderPriceStarting"],
          ])}
          {typography("item_price", "paragraph-3")}
          {editMenuColors("cards")}
        </details>
        {toggle("show_badges", "editorBadges")}
        {toggle("show_descriptions", "editorItemDescriptions", false)}
        {toggle("show_portions", "editorOrderPortions")}
        <details onToggle={(event) => onPreviewItem(event.currentTarget.open)}>
          <summary>{t("editorItemView")}</summary>
          <p>{t("editorItemViewHint")}</p>
          <a className="sqe-button" href={`/${restaurantId}/menu/items`}>
            {t("editorViewItems")}
          </a>
          <button type="button" className="sqe-button sqe-button--outline"
            onClick={() => onChange(["appearance_overrides", "website_order"], previousItemPresentation(value))}>
            {t("editorItemPreviousLayout")}
          </button>
          {select("item_layout", "editorLayout", "standard", [
            ["standard", "editorItemLayoutStandard"], ["cover", "editorItemLayoutCover"],
          ])}
          {select("item_width", "editorItemModalWidth", "standard", [
            ["compact", "editorItemWidthCompact"], ["standard", "editorItemWidthStandard"], ["wide", "editorItemWidthWide"],
          ])}
          {select("item_radius", "editorShape", "soft", [
            ["square", "editorShapeSquare"], ["soft", "editorOrderShapeSoft"], ["rounded", "editorShapeRound"],
          ])}
          <ColorStylePicker itemDetail
            value={String(value.item_color_style ?? "default")}
            inheritedStyle={String(value.color_style ?? "default")}
            defaultLabel={t("editorJourneyInheritMenu")}
            onChange={id => set("item_color_style", id)} />
          <p>{t("editorItemColorsHint")}</p>
          {select("item_aspect_ratio", "editorImageRatio", "4/3", [
            ["1/1", "1:1"],
            ["3/2", "3:2"],
            ["2/3", "2:3"],
            ["4/3", "4:3"],
            ["3/4", "3:4"],
            ["16/9", "16:9"],
            ["9/16", "9:16"],
          ])}
          {select("item_image_fit", "editorImageFit", "cover", [
            ["cover", "editorImageFill"],
            ["contain", "editorImageContain"],
          ])}
        </details>
      </div>
    </div>
  );
}
