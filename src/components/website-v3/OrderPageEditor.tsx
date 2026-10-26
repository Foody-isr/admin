"use client";
import { ItemImageFramingEditor } from "./ItemImageFramingEditor";
import type { MenuItem } from "@/lib/api";
import { BooleanInput } from '@/components/ds/Selection';
import { ColorStylePicker, openSiteColors, type SiteColorEditTarget } from "./ColorStylePicker";
import {
  selectOrderColorStyle,
  previousItemPresentation,
  compactOrderPresentation,
  woltOrderPresentation,
} from "@/lib/website-v3/order-design";

import { NumberInput } from "@/components/ui/NumberInput";
import { OrderTypographyFields } from "./OrderTypographyFields";
import type { TypographyOverrides, TypographyRoleKey } from "@/lib/api";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { DraftPagePayload, StatePath } from "@/lib/website-v3/types";
import type { OrderEditorRegion } from "@/lib/website-v3/editor-selection";
import { record } from "@/lib/website-v3/restaurant-themes";
import { ImageUploadField } from "./SectionContentEditors";

/** Edits the same page-local order blocks rendered by the public order page. */
export function OrderPageEditor({
  restaurantId,
  config = {},
  items = [],
  page,
  region,
  onChange,
  onPreviewItem,
  sharedHeader = false,
  restaurantHeader = false,
  orderChoicesAvailable = true,
  restaurantCoverUrl = "",
  onEditHeader,
}: {
  restaurantId: number;
  config?: Record<string, unknown>;
  items?: MenuItem[];
  page: DraftPagePayload;
  region: OrderEditorRegion;
  onChange: (path: StatePath, value: unknown) => void;
  onPreviewItem: (open: boolean) => void;
  sharedHeader?: boolean;
  restaurantHeader?: boolean;
  orderChoicesAvailable?: boolean;
  restaurantCoverUrl?: string;
  onEditHeader?: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => () => onPreviewItem(false), [onPreviewItem]);
  const value = record(page.appearance_overrides.website_order);
  const set = (key: string, next: unknown) =>
    onChange(["appearance_overrides", "website_order", key], next);
  const editMenuColors = (menuGroup: SiteColorEditTarget["menuGroup"]) => value.color_preset === "wolt" ? (
    <p>{t("editorOrderWoltColorsHint")}</p>
  ) : (
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
  const spacing = (key: string, label: string, fallback: number, max: number) => (
    <label className="sqe-field">{t(label)}
      <NumberInput min={0} max={max} format={String} value={Number(value[key] ?? fallback)}
        onChange={next => set(key, next)} />
    </label>
  );
  const typography = (prefix: string, role: TypographyRoleKey) => (
    <>
      <label className="sqe-field">
        {t("editorTextStyle")}
        <select
          value={String(value[`${prefix}_style`] ?? "inherit")}
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
        prefix === "category_title" && (value[`${prefix}_style`] ?? "inherit") === "inherit"
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
      {(value[`${prefix}_style`] ?? "inherit") === "inherit" && <OrderTypographyFields
        restaurantId={restaurantId} role={role} base={record(config.typography) as TypographyOverrides}
        value={record(page.appearance_overrides.typography) as TypographyOverrides}
        onChange={next => onChange(["appearance_overrides", "typography"], next)} />}
      {(value[`${prefix}_style`] ?? "inherit") !== "inherit" &&
        select(
          `${prefix}_weight`,
          "editorOrderTextWeight",
          String(value[`${prefix}_style`] ?? "inherit").startsWith("title")
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
          framing={page.appearance_overrides.cover_framing}
          onFramingChange={value => onChange(["appearance_overrides", "cover_framing"], value)}
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
        <ColorStylePicker
          value={String(value.fulfillment_color_style ?? "default")}
          inheritedStyle={String(value.color_style ?? "default")}
          defaultLabel={t("editorJourneyInheritMenu")}
          onChange={id => set("fulfillment_color_style", id)} />
        <p>{t("editorOrderModalColorsHint")}</p>
        {sharedHeader ? (
          <button className="sqe-button" onClick={onEditHeader}>
            {t("editorHeader")}
          </button>
        ) : (
          toggle("show_fulfillment", "editorOrderShowService")
        )}
        {orderChoicesAvailable && toggle("prompt_on_entry", "editorOrderPrompt")}
        {toggle("modal_cover", "editorOrderModalCover")}
        {value.modal_cover !== false && <ImageUploadField
          restaurantId={restaurantId}
          label={t("editorOrderModalImage")}
          fieldId="page.appearance_overrides.website_order.modal_cover_url"
          currentUrl={String(value.modal_cover_url || restaurantCoverUrl)}
          framing={value.modal_cover_framing}
          onFramingChange={value => set("modal_cover_framing", value)}
          onUploaded={url => set("modal_cover_url", url)}
          onRemove={() => set("modal_cover_url", "")}
        />}
        <p>{t("editorOrderModalImageHint")}</p>
        {toggle("modal_logo", "editorLogo")}
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
      </div>
      <div className="sqe-order-customize">
        <ItemImageFramingEditor items={items} value={value.item_image_frames} onChange={value => set("item_image_frames", value)} />
        <h3>{t("editorCustomize")}</h3>
        <details open>
          <summary>{t("editorLayoutColor")}</summary>
          <button type="button" className="sqe-button sqe-button--outline"
            onClick={() => onChange(["appearance_overrides", "website_order"], woltOrderPresentation(value))}>
            {t("editorOrderApplyWolt")}
          </button>
          <p>{t("editorOrderWoltHint")}</p>
          <label>{t("editorLayout")}</label>
          <div className="sqe-order-layouts">
            {["list", "grid", "cards", "text", "single", "rows"].map((layout) => (
              <button
                type="button"
                key={layout}
                aria-label={t(`editorOrderLayout_${layout}`)}
                aria-pressed={(value.layout ?? "list") === layout}
                onClick={() => layout === "rows" && value.layout !== "rows"
                  ? onChange(["appearance_overrides", "website_order"], compactOrderPresentation(value))
                  : set("layout", layout)}
              >
                <span data-layout={layout}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <small>{t(`editorOrderLayout_${layout}`)}</small>
              </button>
            ))}
          </div>
          <p>{t("editorOrderCompactHint")}</p>
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
          {value.color_preset === "wolt" ? (
            <div className="sqe-order-preset-colors">
              <strong>{t("editorOrderWoltPalette")}</strong>
              <div aria-hidden="true">{["#000000", "#222222", "#ffffff", "#aaaaaa", "#009fca"].map(color => <i key={color} style={{ background: color }} />)}</div>
              <button type="button" className="sqe-button sqe-button--outline" onClick={() => set("color_preset", "site")}>
                {t("editorOrderUseSiteColors")}
              </button>
            </div>
          ) : <ColorStylePicker
            menuGroup="list"
            value={String(value.color_style ?? "default")}
            onChange={(id) =>
              onChange(
                ["appearance_overrides", "website_order"],
                selectOrderColorStyle(value, id),
              )
            }
          />}
          <p>{t(value.color_preset === "wolt" ? "editorOrderWoltColorsHint" : "editorOneMenuColorStyle")}</p>
          {select("background_kind", "editorBackground", "style", [
            ["style", "editorOrderColorStyle"],
            ["image", "editorField_image_url"],
          ])}
          {value.background_kind === "image" && (
            <ImageUploadField
              restaurantId={restaurantId}
              label={t("editorBackgroundMedia")}
              framing={value.background_image_framing}
              onFramingChange={value => set("background_image_framing", value)}
              currentUrl={String(value.background_image ?? "")}
              onUploaded={(url) => set("background_image", url)}
              onRemove={() => set("background_image", "")}
            />
          )}
        </details>
        <h3>{t("editorContent")}</h3>
        {toggle("sticky_categories", "editorOrderStickyCategories")}
        <p>{t("editorOrderStickyCategoriesHint")}</p>
        {select("category_shape", "editorOrderCategoryStyle", value.card_style === "filled" ? "pill" : "plain", [
          ["plain", "editorOrderCategoryStylePlain"],
          ["underline", "editorOrderCategoryStyleUnderline"],
          ["rounded", "editorShapeRound"],
          ["pill", "editorOrderShapePill"],
        ])}
        <p>{t("editorOrderCategoryStyleHint")}</p>
        <details>
          <summary>{t("editorCategoryMenu")}</summary>
          {toggle("show_categories", "editorCategoryMenu")}
          {typography("category", "categoryBar")}
          {spacing("category_gap", "editorCategoryGap", 20, 80)}
          {editMenuColors("categories")}
          <p>{t("editorOrderCategoryColorsHint")}</p>
        </details>
        {toggle("show_search", "editorOrderSearch")}
        {toggle("show_availability_filter", "editorOrderAvailabilityFilter")}
        {toggle("show_category_titles", "editorCategoryTitles")}
        {value.show_category_titles !== false && (
          <details>
            <summary>{t("editorCategoryTitleStyle")}</summary>
            {typography("category_title", "categoryTitle")}
            {spacing("category_spacing", "editorCategorySpacing", 48, 160)}
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
            ["separator", "editorOrderBorderSeparator"],
          ])}
          {spacing("item_spacing", "editorOrderItemSpacing", value.card_style === "filled" ? 16 : 32, 80)}
          {value.layout === "rows" && spacing("row_padding", "editorOrderRowPadding", 16, 48)}
          {select("price_placement", "editorOrderPricePlacement", value.card_style === "filled" ? "bottom" : "after_description", [
            ["after_description", "editorOrderPriceAfterDescription"],
            ["bottom", "editorOrderPriceBottom"],
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
          {(value.layout ?? "list") !== "grid" && value.layout !== "cards" && <>
            {select("image_position", "editorOrderImagePosition", "auto", [
              ["auto", "editorOrderInherited"],
              ["left", "editorAlign_left"],
              ["right", "editorAlign_right"],
            ])}
            {select("image_size", "editorOrderImageSize", "default", [
              ["default", "editorOrderInherited"],
              ["small", "editorSizeSmall"],
              ["medium", "editorSizeMedium"],
              ["large", "editorSizeLarge"],
            ])}
          </>}
          {select("image_ratio", "editorImageRatio", "square", [
            ["square", "editorShapeSquare"],
            ["landscape", "editorLandscape"],
            ["wide", "editorOrderImageWide"],
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
          {typography("item_title", "itemName")}
        </details>
        <details>
          <summary>{t("editorItemPrices")}</summary>
          {toggle("show_prices", "editorItemPrices")}
          {select("price_display", "editorOrderPriceDisplay", "range", [
            ["range", "editorOrderPriceRange"],
            ["starting", "editorOrderPriceStarting"],
          ])}
          {typography("item_price", "itemPrice")}
          {editMenuColors("cards")}
        </details>
        {toggle("show_badges", "editorBadges")}
        <details>
          <summary>{t("editorItemDescriptions")}</summary>
          {toggle("show_descriptions", "editorItemDescriptions", false)}
          {typography("item_description", "itemDescription")}
          {select("description_lines", "editorOrderDescriptionLines", "default", [
            ["default", "editorOrderInherited"], ["1", "1"], ["2", "2"], ["3", "3"],
            ["all", "editorOrderDescriptionAll"],
          ])}
        </details>
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
