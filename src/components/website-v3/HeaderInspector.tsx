"use client";
import { ColorStylePicker } from "./ColorStylePicker";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ArrowLeft, Link as LinkIcon, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  HEADER_LAYOUTS,
  headerFromLegacy,
  orderHeaderPresentation,
  resolvePageHeader,
  type HeaderElement,
  type HeaderTarget,
  type WebsiteHeader,
} from "@/lib/website-v3/header";
import type {
  DraftConfigPayload,
  DraftPagePayload,
  DraftSectionPayload,
} from "@/lib/website-v3/types";
import { InspectorField, ToggleField, controlClass } from "./controls";
import { HeaderMedia } from "./HeaderMedia";
import { HeaderLinksEditor, HeaderTargetDialog } from "./HeaderLinkEditor";
import { headerCopy } from "./header-copy";
import { colorContrast, normalizeSiteColors } from "@/lib/website-v3/site-colors";

/** Edits the versioned Header component using the same controls as the public renderer. */
export function HeaderInspector({
  config,
  pages,
  sections,
  restaurantId,
  restaurantLogoUrl,
  restaurantCoverUrl,
  onChange,
  activeElement,
  page,
  onOrderHeaderChange,
  onOpenOrderJourney,
}: {
  config: DraftConfigPayload;
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
  restaurantId: number;
  restaurantLogoUrl?: string;
  restaurantCoverUrl?: string;
  onChange: (path: readonly (string | number)[], value: unknown) => void;
  activeElement?: HeaderElement;
  onOpenOrderJourney?: () => void;
  page?: DraftPagePayload | null;
  onOrderHeaderChange?: (header: ReturnType<typeof orderHeaderPresentation> | null, shared: WebsiteHeader) => void;
}) {
  const { locale, t } = useI18n(),
    c = headerCopy(locale);
  const root = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState(false),
    [customize, setCustomize] = useState(true),
    [open, setOpen] = useState<Record<string, boolean>>({ layout: true }),
    [editing, setEditing] = useState<"logo" | "button" | null>(null);
  const nav =
    config.nav_layout && typeof config.nav_layout === "object"
      ? (config.nav_layout as Record<string, unknown>)
      : {};
  const sharedHeader = headerFromLegacy(
    config,
    pages,
    typeof config.restaurant_logo_url === "string"
      ? config.restaurant_logo_url
      : restaurantLogoUrl,
  );
  const customOrderHeader = page?.type === "order" && page.appearance_overrides.order_header?.version === 1;
  const header = resolvePageHeader(sharedHeader, page?.type, page?.appearance_overrides);
  const saveHeader = (value: WebsiteHeader) => customOrderHeader && onOrderHeaderChange
    ? onOrderHeaderChange(orderHeaderPresentation(value), sharedHeader)
    : onChange(["nav_layout"], { ...nav, header: value });
  const restaurantLayout = header.layout === "restaurant";
  const set = <K extends keyof WebsiteHeader>(
    key: K,
    value: WebsiteHeader[K],
  ) =>
    saveHeader({ ...header, [key]: value });
  const patch = <
    K extends
      | "background"
      | "logo"
      | "navigation"
      | "button"
      | "icons"
      | "fulfillment"
      | "restaurant",
  >(
    key: K,
    value: Partial<WebsiteHeader[K]>,
  ) => set(key, { ...header[key], ...value });
  useEffect(() => {
    if (!activeElement) return;
    setLinks(false);
    setCustomize(true);
    setOpen((v) => ({ ...v, [activeElement]: true }));
    requestAnimationFrame(() =>
      root.current
        ?.querySelector(`[data-header-panel="${activeElement}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }, [activeElement]);
  const accordion = (
    key: string,
    title: string,
    children: ReactNode,
    toggle?: ReactNode,
  ) => (
    <section className="sqh-accordion" data-header-panel={key}>
      <div className="sqh-accordion-heading">
        <button
          aria-expanded={Boolean(open[key])}
          onClick={() => setOpen({ ...open, [key]: !open[key] })}
        >
          {title}
          <ChevronDown
            size={16}
            style={{ transform: open[key] ? "rotate(180deg)" : undefined }}
          />
        </button>
        {toggle}
      </div>
      {open[key] && <div className="sqh-accordion-body">{children}</div>}
    </section>
  );
  const check = (
    label: string,
    checked: boolean,
    change: (v: boolean) => void,
  ) => (
    <label className="sqh-check">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => change(e.target.checked)}
      />
    </label>
  );
  const color = (
    label: string,
    value: string,
    change: (v: string) => void,
    fallback = "#111111",
  ) => (
    <div className="sqh-color">
      <label>
        <span>{label}</span>
        <input
          aria-label={label}
          type="color"
          value={value || fallback}
          onChange={(e) => change(e.target.value)}
        />
      </label>
      {value && <button onClick={() => change("")}>{c.reset}</button>}
    </div>
  );
  const targetLabel = (target: HeaderTarget) =>
    target.kind === "page"
      ? (pages.find((p) => p.slug === target.value)?.title ?? c.page)
      : c[target.kind];
  const linkRow = (key: "logo" | "button") => (
    <button className="sqh-target" onClick={() => setEditing(key)}>
      <LinkIcon size={18} />
      <span>
        <small>{c.link}</small>
        {targetLabel(header[key].link)}
      </span>
      <u>{c.edit}</u>
    </button>
  );
  const toggle = (
    key: "navigation" | "button" | "fulfillment",
    label: string,
  ) => (
    <ToggleField
      fieldId={`header.${key}.enabled`}
      label={label}
      checked={header[key].enabled}
      onChange={(v) => patch(key, { enabled: v })}
    />
  );
  if (links)
    return (
      <div className="sqh-editor">
        <button className="sqh-back" onClick={() => setLinks(false)}>
          <ArrowLeft size={20} />
          {c.editLinks}
        </button>
        <HeaderLinksEditor
          copy={c}
          pages={pages}
          sections={sections}
          value={header.navigation.links}
          onChange={(value) => patch("navigation", { links: value })}
        />
      </div>
    );
  return (
    <div className="sqh-editor" ref={root}>
      {page?.type === "order" && onOrderHeaderChange && <section className="sqh-scope">
        <InspectorField label={c.orderHeader}>
          <select className={controlClass} aria-label={c.orderHeader} value={customOrderHeader ? "custom" : "inherit"}
            onChange={e => { setLinks(false); setEditing(null); onOrderHeaderChange(e.target.value === "custom" ? orderHeaderPresentation(sharedHeader) : null, sharedHeader); }}>
            <option value="inherit">{c.sameAsSite}</option>
            <option value="custom">{c.orderSpecific}</option>
          </select>
        </InspectorField>
        <p>{customOrderHeader ? c.sharedContentHint : c.sharedHeaderHint}</p>
      </section>}
      {!customOrderHeader && <section className="sqh-navigation">
        <h3>{toggle("navigation", c.navigation)}</h3>
        {header.navigation.enabled && (
          <>
            {!restaurantLayout && <div className="sqh-radio-stack">
              {(["dropdown", "mega"] as const).map((mode) => (
                <label key={mode}>
                  <span>
                    {c[mode]}
                    <small>
                      {mode === "dropdown" ? c.dropdownHelp : c.megaHelp}
                    </small>
                  </span>
                  <input
                    type="radio"
                    name="header-navigation"
                    checked={header.navigation.mode === mode}
                    onChange={() => patch("navigation", { mode })}
                  />
                </label>
              ))}
            </div>}
            <button
              className="sqe-button sqe-button-secondary w-full"
              onClick={() => setLinks(true)}
            >
              {c.editLinks}
            </button>
          </>
        )}
      </section>}
      {!customOrderHeader && <div className="sqh-divider" />}
      <button
        className="sqh-customize"
        aria-expanded={customize}
        onClick={() => setCustomize(!customize)}
      >
        {c.customize}
        <ChevronDown
          size={19}
          style={{ transform: customize ? "rotate(180deg)" : undefined }}
        />
      </button>
      {customize && (
        <>
          {accordion(
            "layout",
            c.layoutColor,
            <>
              <HeaderGroup label={c.layout}>
                <div className="sqh-layouts">
                  {HEADER_LAYOUTS.map((layout) => (
                    <button
                      key={layout}
                      aria-label={c[layout]}
                      aria-pressed={header.layout === layout}
                      onClick={() => layout === "restaurant" ? saveHeader({
                        ...header, layout, color_style: header.color_style === "default" ? normalizeSiteColors(config.custom_palette).styles.reduce((best, style) => colorContrast(style.background, "#ffffff") > colorContrast(best.background, "#ffffff") ? style : best).id : header.color_style,
                        background: {...header.background, mode: "image"},
                        logo: {...header.logo, type: header.logo.image || restaurantLogoUrl ? "image" : header.logo.type, size: 140},
                        icons: {...header.icons, cart: false, search: false},
                      }) : set("layout", layout)}
                    >
                      <span
                        className={`sqh-layout sqh-layout--${layout}`}
                        aria-hidden="true"
                      >
                        <i />
                        <b />
                        <em />
                      </span>
                    </button>
                  ))}
                </div>
              </HeaderGroup>
              <div className="sqh-tip">
                <Star size={19} />
                <span>
                  {c.tip}
                  <button
                    onClick={() => {
                      patch("background", { mode: "image" });
                      setOpen({ ...open, background: true });
                    }}
                  >
                    {c.addBackground}
                  </button>
                </span>
              </div>
              {!restaurantLayout && <HeaderGroup label={c.scroll}>
                <div className="sqh-radio-stack">
                  {(["sticky", "reveal", "none"] as const).map((scroll) => (
                    <label key={scroll}>
                      <span>{c[scroll]}</span>
                      <input
                        type="radio"
                        name="header-scroll"
                        checked={header.scroll === scroll}
                        onChange={() => set("scroll", scroll)}
                      />
                    </label>
                  ))}
                </div>
              </HeaderGroup>
              }
              <HeaderGroup label={c.colorStyle}>
                <ColorStylePicker value={header.color_style} onChange={id => set("color_style", id as WebsiteHeader["color_style"])} />
                <p>{c.navigationColorHint}</p>
              </HeaderGroup>
            </>,
          )}
          {accordion(
            "background",
            c.background,
            <>
              {restaurantLayout && <InspectorField label={c.height}><select className={controlClass} value={header.restaurant.height} onChange={e => patch("restaurant", {height: e.target.value as WebsiteHeader["restaurant"]["height"]})}>{(["small", "medium", "large"] as const).map(size => <option key={size} value={size}>{c[size]}</option>)}</select></InspectorField>}
              <select
                aria-label={c.background}
                className={controlClass}
                value={header.background.mode}
                onChange={(e) =>
                  patch("background", {
                    mode: e.target.value as WebsiteHeader["background"]["mode"],
                  })
                }
              >
                {(
                  [
                    "transparent",
                    "style",
                    "color",
                    "gradient",
                    "image",
                  ] as const
                ).filter(mode => !restaurantLayout || mode === "image" || mode === "style").map((mode) => (
                  <option key={mode} value={mode}>
                    {c[mode]}
                  </option>
                ))}
              </select>
              {!restaurantLayout && ["color", "gradient"].includes(header.background.mode) &&
                color(
                  c.color,
                  header.background.color,
                  (value) => patch("background", { color: value }),
                  "#ffffff",
                )}
              {!restaurantLayout && header.background.mode === "gradient" && (
                <>
                  {color(
                    c.endColor,
                    header.background.end,
                    (value) => patch("background", { end: value }),
                    "#ffffff",
                  )}
                  <InspectorField label={c.angle}>
                    <input
                      aria-label={c.angle}
                      type="range"
                      min={0}
                      max={360}
                      value={header.background.angle}
                      onChange={(e) =>
                        patch("background", { angle: Number(e.target.value) })
                      }
                    />
                  </InspectorField>
                </>
              )}
              {header.background.mode === "image" && (
                <>
                  <HeaderMedia
                    restaurantId={restaurantId}
                    value={header.background.image || (restaurantLayout ? restaurantCoverUrl || "" : "")}
                    onChange={(image) => patch("background", { image, ...(restaurantLayout && !image ? {mode: "style" as const} : {}) })}
                    copy={c}
                  />
                  <InspectorField label={c.overlay}>
                    <input
                      aria-label={c.overlay}
                      type="range"
                      min={0}
                      max={100}
                      value={header.background.overlay}
                      onChange={(e) =>
                        patch("background", { overlay: Number(e.target.value) })
                      }
                    />
                  </InspectorField>
                </>
              )}
            </>,
          )}
          {restaurantLayout && accordion("restaurant", c.restaurantInfo, <>
            {check(c.showInfo, header.restaurant.info_enabled, value => patch("restaurant", {info_enabled: value}))}
            {header.restaurant.info_enabled && <>
              <HeaderGroup label={c.colorStyle}><ColorStylePicker value={header.restaurant.info_color_style} onChange={value => patch("restaurant", {info_color_style: value as WebsiteHeader["restaurant"]["info_color_style"]})}/></HeaderGroup>
              {check(c.showStatus, header.restaurant.show_status, value => patch("restaurant", {show_status: value}))}
              {check(c.showMinimum, header.restaurant.show_minimum, value => patch("restaurant", {show_minimum: value}))}
              {check(c.showSocial, header.restaurant.show_social, value => patch("restaurant", {show_social: value}))}
            </>}
            <p>{c.rulesHint}</p><a href={`/${restaurantId}/settings`} className="sqe-button">{c.orderSettings}</a>
          </>)}
          <div className="sqh-divider" />
          <h3 className="sqh-content-title">{c.content}</h3>
          {accordion(
            "logo",
            c.logo,
            <>
              {restaurantLayout && check(c.restaurantName, header.restaurant.show_name, value => patch("restaurant", {show_name: value}))}
              {!customOrderHeader && <>
              <InspectorField label={c.type}>
                <select
                  className={controlClass}
                  value={header.logo.type}
                  onChange={(e) =>
                    patch("logo", { type: e.target.value as "text" | "image" })
                  }
                >
                  <option value="text">{c.text}</option>
                  <option value="image">{c.image}</option>
                </select>
              </InspectorField>
              {header.logo.type === "image" ? (
                <HeaderMedia
                  restaurantId={restaurantId}
                  value={header.logo.image || (restaurantLayout ? restaurantLogoUrl || "" : "")}
                  onChange={(image) => patch("logo", { image, ...(restaurantLayout && !image ? {type: "text" as const} : {}) })}
                  copy={c}
                />
              ) : (
                <InspectorField label={c.logoText}>
                  <input
                    className={controlClass}
                    value={header.logo.text}
                    maxLength={200}
                    onChange={(e) => patch("logo", { text: e.target.value })}
                  />
                </InspectorField>
              )}
              </>}
              <InspectorField label={c.size}>
                <div className="sqh-range">
                  <input
                    aria-label={c.size}
                    type="range"
                    min={24}
                    max={160}
                    value={header.logo.size}
                    onChange={(e) =>
                      patch("logo", { size: Number(e.target.value) })
                    }
                  />
                  <output>{header.logo.size}</output>
                </div>
              </InspectorField>
              {!customOrderHeader && <>
              {linkRow("logo")}
              <p>{c.logoHelp}</p>
              {!restaurantLayout && check(
                c.customBackground,
                header.logo.custom_background,
                (value) => patch("logo", { custom_background: value }),
              )}
              {!restaurantLayout && header.logo.custom_background &&
                color(
                  c.background,
                  header.logo.background,
                  (value) => patch("logo", { background: value }),
                  "#ffffff",
                )}
              </>}
            </>,
          )}
          {!customOrderHeader && accordion(
            "navigation",
            c.navigation,
            <>
              {check(c.caps, header.navigation.uppercase, (value) =>
                patch("navigation", { uppercase: value }),
              )}
              {color(c.textColor, header.navigation.color, (value) =>
                patch("navigation", { color: value }),
              )}
            </>,
          )}
          {!customOrderHeader && !restaurantLayout && accordion(
            "button",
            c.button,
            <>
              {toggle("button", c.button)}
              <InspectorField label={c.buttonText}>
                <input
                  className={controlClass}
                  maxLength={200}
                  value={header.button.text}
                  placeholder={c.order}
                  onChange={(e) => patch("button", { text: e.target.value })}
                />
              </InspectorField>
              {linkRow("button")}
              <InspectorField label={c.style}>
                <select
                  className={controlClass}
                  value={header.button.style}
                  onChange={(e) =>
                    patch("button", {
                      style: e.target.value as "filled" | "outline",
                    })
                  }
                >
                  <option value="filled">{c.filled}</option>
                  <option value="outline">{c.outline}</option>
                </select>
              </InspectorField>
              {color(
                c.color,
                header.button.color,
                (value) => patch("button", { color: value }),
                String((config.custom_palette as Record<string, unknown> | undefined)?.accent || config.brand_color || "#111111"),
              )}
              <button
                className="sqe-button sqe-button-secondary w-full"
                onClick={() => patch("button", { style: "filled", color: "" })}
              >
                {c.reset}
              </button>
            </>,
          )}
          {!customOrderHeader && accordion(
            "icons",
            c.icons,
            <>
              {!restaurantLayout && color(c.color, header.icons.color, (value) =>
                patch("icons", { color: value }),
              )}
              {check(c.cart, header.icons.cart, (value) =>
                patch("icons", { cart: value }),
              )}
              {onOpenOrderJourney && <button className="sqe-text-button" onClick={onOpenOrderJourney}>{t("editorOrderJourney")}</button>}
              {check(c.search, header.icons.search, (value) =>
                patch("icons", { search: value }),
              )}
            </>,
          )}
          {!customOrderHeader && accordion(
            "fulfillment",
            c.fulfillment,
            <>
              {toggle("fulfillment", c.fulfillment)}
              <p>{c.fulfillmentHelp}</p><p>{c.rulesHint}</p>
            </>,
          )}
        </>
      )}
      {editing && (
        <HeaderTargetDialog
          copy={c}
          pages={pages}
          sections={sections}
          value={header[editing].link}
          onClose={() => setEditing(null)}
          onSave={(link) => {
            patch(editing, { link });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function HeaderGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="sqh-control-group">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}
