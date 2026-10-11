"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { loadWebsiteFont } from "@/lib/website-fonts";
import type { ThemeCatalog } from "@/lib/api";
import type { SiteColorEditTarget } from "./ColorStylePicker";
import { SiteColorsEditor } from "./SiteColorsEditor";
import { PreviewCanvas } from "./PreviewCanvas";
import { SITE_STYLES, applySiteStyle, defaultThemeStyle, type SiteStyle } from "@/lib/website-v3/site-styles";
import type { ApplyRestaurantThemeOptions } from "@/lib/website-v3/restaurant-themes";
import { pageKey } from "@/lib/website-v3/types";
import type { DraftStatePayload } from "@/lib/website-v3/types";
import {
  RESTAURANT_THEMES,
  applyRestaurantTheme,
  record,
  type RestaurantTheme,
} from "@/lib/website-v3/restaurant-themes";

type Screen =
  "root" | "colors" | "fonts" | "styles" | "themes" | "detail" | "buttons";

/** Global site design with non-destructive theme previews and an explicit apply action. */
export function SiteDesign({
  state,
  initialScreen = "root",
  colorTarget,
  previewContext,
  catalog,
  restaurantName,
  description,
  image,
  onChange,
  onPreview,
  onApplied,
  onSelectPreviewPage,
  previewPageKey,
  onEditShared,
}: {
  state: DraftStatePayload;
  initialScreen?: "root" | "colors" | "buttons";
  colorTarget?: SiteColorEditTarget;
  previewContext: { webOrigin: string; restaurantSlug: string; restaurantId: number };
  catalog: ThemeCatalog;
  restaurantName: string;
  description: string;
  image: string;
  onChange: (state: DraftStatePayload) => void;
  onPreview: (state: DraftStatePayload | null) => void;
  onEditShared: () => void;
  onApplied: (state: DraftStatePayload) => void;
  onSelectPreviewPage: (key: string) => void;
  previewPageKey?: string | null;
}) {
  const { t } = useI18n();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [candidate, setCandidate] = useState<RestaurantTheme | null>(null);
  const [styleCandidate, setStyleCandidate] = useState<SiteStyle | null>(null);
  const allPages = true;
  const [compose, setCompose] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [applied, setApplied] = useState(false);
  const colorPreviewPage = state.pages.find(page => page.is_homepage) ?? state.pages[0];
  const hasOrderingPage = state.pages.some((page) => page.type === "order");
  const palette = record(state.config.custom_palette);
  const currentTheme = catalog.themes.find(
    (theme) => theme.id === state.config.theme_id,
  );
  const bg = String(
    palette.bg ?? currentTheme?.preview.swatches[0] ?? "#ffffff",
  );
  const ink = String(
    palette.ink ?? currentTheme?.preview.swatches[3] ?? "#101010",
  );
  const accent = String(
    palette.accent ?? currentTheme?.preview.swatches[2] ?? "#101010",
  );
  const surface = String(
    palette.surface ?? currentTheme?.preview.swatches[1] ?? "#f5f5f5",
  );
  const typography = record(state.config.typography),
    site = record(typography.site);
  const heading = String(
    site.headingFont ?? state.config.hero_name_font ?? "Manrope",
  );
  const body = String(site.bodyFont ?? "Manrope");
  useEffect(() => {
    loadWebsiteFont(heading);
    loadWebsiteFont(body);
  }, [heading, body]);
  useEffect(() => {
    if (screen === "themes" || screen === "styles" || screen === "detail") {
      [...RESTAURANT_THEMES, ...SITE_STYLES].forEach((theme) => loadWebsiteFont(theme.heading));
    }
  }, [screen]);
  useEffect(() => () => onPreview(null), [onPreview]);
  const themeOptions = useMemo<ApplyRestaurantThemeOptions>(() => ({
    allPages, compose, orderingOnly: ordering,
    title: restaurantName, description, image, cta: t("editorOrderNow"),
    copy: {
      home: t("editorTemplateHome"), about: t("editorTemplateAbout"),
      locations: t("editorLocationHours"), contact: t("editorTemplateContact"),
      menu: t("editorTemplateMenu"), catering: t("editorThemeCatering"), events: t("editorEvents"),
      story: t("editorThemeStory"), headline: t("editorThemeHeadline"),
      welcome: t("editorWelcome"), discover: t("editorDiscover"), fresh: t("editorThemeFresh"),
      starters: t("editorThemeStarters"), mains: t("editorThemeMains"), drinks: t("editorThemeDrinks"),
      send: t("editorThemeSend"), name: t("editorThemeName"), email: t("editorThemeEmail"), message: t("editorThemeMessage"),
    },
    createId: () => `section-${crypto.randomUUID()}`,
  }), [allPages, compose, ordering, restaurantName, description, image, t]);
  const compositionDraft = useMemo(() => candidate ? applyRestaurantTheme(state, candidate, themeOptions) : null, [candidate, state, themeOptions]);
  const candidateDraft = useMemo(() => styleCandidate ? applySiteStyle(compositionDraft ?? state, styleCandidate) : compositionDraft, [compositionDraft, state, styleCandidate]);
  useEffect(() => onPreview(candidateDraft), [candidateDraft, onPreview]);
  const patch = (value: Record<string, unknown>) =>
    onChange({ ...state, config: { ...state.config, ...value } });
  const patchSite = (value: Record<string, unknown>) =>
    patch({ typography: { ...typography, site: { ...site, ...value } } });
  const previewTheme = (theme: RestaurantTheme, withLayout = false) => {
    setApplied(false);
    if (!withLayout) setOrdering(false);
    setCompose(withLayout);
    setStyleCandidate(null);
    setCandidate(theme);
    setScreen("detail");
  };
  const apply = () => {
    if (!candidateDraft) return;
    // Persist exactly what was previewed, including temporary IDs and link targets.
    onChange(candidateDraft);
    onApplied(candidateDraft);
    onPreview(null);
    setCandidate(null);
    setStyleCandidate(null);
    setApplied(true);
    setScreen("root");
  };
  const back = () => {
    setCandidate(null);
    setStyleCandidate(null);
    onPreview(null);
    setScreen("root");
  };
  const previewStyle = (style: SiteStyle) => {
    setApplied(false);
    setStyleCandidate(style);
  };
  const styleCards = (styles: readonly SiteStyle[]) => (
    <div className="sqe-style-grid">
      {styles.map(style => <button key={style.id} aria-label={style.name}
        aria-pressed={styleCandidate?.id === style.id || (!styleCandidate && style.id === (candidate ? `original-${candidate.id}` : site.style))}
        onClick={() => previewStyle(style)}
        style={{background: style.bg, color: style.ink, fontFamily: style.heading}}>
        <strong>Aa</strong><i style={{background: style.accent, borderRadius: style.shape === "pill" ? 24 : style.shape === "rounded" ? 6 : 0}} />
      </button>)}
    </div>
  );
  const fontOptions = Array.from(
    new Set([
      heading,
      body,
      "Manrope",
      "Dela Gothic One",
      "DM Serif Display",
      "Bagel Fat One",
      "Inter",
      "Heebo",
      "Assistant",
      "Noto Sans Hebrew",
      ...catalog.typography_pairings.flatMap((p) => [
        p.pairing.displayLatin.family,
        p.pairing.bodyLatin.family,
        p.pairing.displayHebrew.family,
        p.pairing.bodyHebrew.family,
      ]),
    ]),
  );
  return (
    <>
      {screen !== "root" && screen !== "themes" && (
        <div className="sqe-panel-body" style={{ paddingBottom: 0 }}>
          <button
            className="sqe-icon-button"
            onClick={back}
            aria-label={t("editorBack")}
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      )}
      {screen === "root" && (
        <div className="sqe-panel-body">
          {applied && <p role="status">{t("editorThemeReady")}</p>}
          <section>
            <h3>{t("editorStyles")}</h3>
            <div className="sqe-style-card">
              <div
                className="sqe-style-sample"
                style={{ background: bg, color: ink }}
              >
                <strong style={{ fontFamily: heading }}>
                  {t("editorHeadings")}
                </strong>
                <span style={{ fontFamily: body }}>{t("editorBody")}</span>
                <span
                  style={{
                    display: "block",
                    width: 64,
                    height: 16,
                    borderRadius: 24,
                    background: accent,
                    marginTop: 12,
                  }}
                />
              </div>
              <button
                className="sqe-button sqe-button--outline"
                onClick={() => setScreen("styles")}
              >
                {t("editorSelectStyle")}
              </button>
            </div>
            <button
              className="sqe-design-row"
              onClick={() => setScreen("themes")}
            >
              {t("editorThemes")}
              <ChevronRight size={18} />
            </button>
          </section>
          <button className="sqe-design-row" onClick={onEditShared}>
            {t("editorLogo")}
            <ChevronRight size={18} />
          </button>
          <button
            className="sqe-design-row"
            onClick={() => setScreen("colors")}
          >
            {t("editorColors")}
            <span className="sqe-design-swatches">
              {[accent, ...(Array.isArray(palette.secondary_colors) ? palette.secondary_colors.slice(0, 2).map(String) : [bg, ink])].map((color, index) => (
                <i key={index} style={{ background: color }} />
              ))}
            </span>
          </button>
          <button className="sqe-design-row" onClick={() => setScreen("fonts")}>
            {t("editorFonts")}
            <span style={{ fontFamily: heading }}>Aa</span>
          </button>
          <button
            className="sqe-design-row"
            onClick={() => setScreen("buttons")}
          >
            {t("editorCorners")}
            <ChevronRight size={18} />
          </button>
          <section style={{ marginTop: 32 }}>
            <h3>{t("editorElements")}</h3>
            <button
              className="sqe-design-row"
              onClick={() => setScreen("buttons")}
            >
              {t("editorButtons")}
              <ChevronRight size={18} />
            </button>
            <button className="sqe-design-row" onClick={onEditShared}>
              {t("editorSiteSettings")}
              <ChevronRight size={18} />
            </button>
          </section>
        </div>
      )}
      {screen === "colors" && <SiteColorsEditor config={state.config} previewPageKey={previewPageKey ?? (colorPreviewPage ? pageKey(colorPreviewPage) : undefined)} target={colorTarget} pages={state.pages} sections={state.sections} palette={{mode: currentTheme?.mode || "light", bg, ink, accent, surface, ...palette}} onChange={next => patch({theme_id: "custom", brand_color: null, custom_palette: next})} />}
      {screen === "fonts" && (
        <div className="sqe-panel-body">
          <h3>{t("editorFonts")}</h3>
          {(
            [
              ["headingFont", "editorHeadings", heading],
              ["bodyFont", "editorBody", body],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="sqe-field">
              <span>{t(label)}</span>
              <select
                value={value}
                onChange={(e) => patchSite({ [key]: e.target.value })}
              >
                {fontOptions.map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
            </label>
          ))}
          <p
            style={{
              fontFamily: heading,
              fontSize: 28,
              lineHeight: "36px",
              color: ink,
            }}
          >
            {restaurantName}
          </p>
          <p style={{ fontFamily: body }}>
            {description || t("editorStylesHint")}
          </p>
        </div>
      )}
      {screen === "buttons" && (
        <div className="sqe-panel-body">
          <h3>{t("editorButtons")}</h3>
          <div className="sqe-layout-choices">
            {(["pill", "rounded", "square"] as const).map((shape) => (
              <button
                className="sqe-layout-choice"
                key={shape}
                aria-pressed={(site.buttonShape ?? "pill") === shape}
                onClick={() =>
                  patch({
                    typography: {
                      ...typography,
                      site: { ...site, buttonShape: shape },
                    },
                    navbar_cta: { ...record(state.config.navbar_cta), shape },
                  })
                }
              >
                <span
                  style={{
                    display: "block",
                    height: 24,
                    background: "#101010",
                    borderRadius:
                      shape === "pill" ? 24 : shape === "rounded" ? 6 : 0,
                    margin: "4px 6px",
                  }}
                />
                <span>
                  {t(
                    shape === "pill"
                      ? "editorShapePill"
                      : shape === "rounded"
                        ? "editorShapeRound"
                        : "editorShapeSquare",
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {screen === "styles" && (
        <div className="sqe-panel-body">
          <h3>{t("editorStyles")}</h3>
          <p>{t("editorStylesHint")}</p>
          {styleCards(SITE_STYLES)}
          {styleCandidate && <button className="sqe-button sqe-button--primary" style={{marginTop: 24}} onClick={apply}>{t("editorApplyStyle")}</button>}
        </div>
      )}
      {screen === "themes" && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) back();
          }}
        >
          <Dialog.Content className="sqe-gallery" aria-describedby={undefined}>
            <div className="sqe-gallery-top">
              <button
                className="sqe-icon-button"
                onClick={back}
                aria-label={t("editorClose")}
              >
                <X size={22} />
              </button>
              <strong>{t("editorThemes")}</strong>
            </div>
            <Dialog.Title asChild>
              <h1>{t("editorChooseTheme")}</h1>
            </Dialog.Title>
            <span
              className="sqe-button sqe-button--primary"
              style={{ marginBottom: 16 }}
            >
              {t("editorRestaurants")}
            </span>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              <button
                className={`sqe-button ${!ordering ? "sqe-button--primary" : ""}`}
                aria-pressed={!ordering}
                onClick={() => setOrdering(false)}
              >
                {t("editorMultiPage")}
              </button>
              <button
                className={`sqe-button ${ordering ? "sqe-button--primary" : ""}`}
                aria-pressed={ordering}
                disabled={!hasOrderingPage}
                onClick={() => setOrdering(true)}
              >
                {t("editorOrderingOnly")}
              </button>
            </div>
            <div className="sqe-gallery-grid">
              {RESTAURANT_THEMES.filter(
                (theme) => !ordering || theme.ordering,
              ).map((theme) => (
                <article className="sqe-theme-card" key={theme.id}>
                  <div className="sqe-theme-art">
                    <ThemeThumbnail theme={theme} state={state} options={themeOptions} context={previewContext} />
                  </div>
                  <footer>
                    <strong>{theme.name}</strong>
                    <button
                      className="sqe-button"
                      onClick={() => previewTheme(theme, true)}
                    >
                      {t("editorPreview")}
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}
      {screen === "detail" && candidate && (
        <div className="sqe-panel-body">
          <h3>{candidate.name}</h3>
          <p>{t("editorStylesHint")}</p>
          <h3>{t("editorRemixStyles")}</h3>
          {styleCards([defaultThemeStyle(candidate), ...SITE_STYLES])}
          {candidateDraft && compose && !ordering && (
            <label className="sqe-field">
              <span>{t("editorPages")}</span>
              <select aria-label={t("editorPages")}
                value={pageKey(candidateDraft.pages.find(page => pageKey(page) === previewPageKey) ?? candidateDraft.pages.find(page => page.is_homepage)!)}
                onChange={event => onSelectPreviewPage(event.target.value)}>
                {candidateDraft.pages.map(page => (
                  <option key={pageKey(page)} value={pageKey(page)}>{page.title}</option>
                ))}
              </select>
            </label>
          )}
          <button className="sqe-button sqe-button--primary" onClick={apply}>
            {t(compose || ordering ? "editorUseTheme" : "editorApplyStyle")}
          </button>

        </div>
      )}
    </>
  );
}

const noop = () => undefined;

/** Gallery cards use the same storefront renderer and draft recipe as the full preview. */
function ThemeThumbnail({ theme, state, options, context }: {
  theme: RestaurantTheme;
  state: DraftStatePayload;
  options: ApplyRestaurantThemeOptions;
  context: { webOrigin: string; restaurantSlug: string; restaurantId: number };
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [visible, setVisible] = useState(false);
  const draft = useMemo(() => applyRestaurantTheme(state, theme, { ...options, compose: true, allPages: true }), [state, theme, options]);
  useEffect(() => {
    if (!root.current) return;
    const resize = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    resize.observe(root.current);
    observer.observe(root.current);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);
  const home = draft.pages.find(page => page.is_homepage);
  return (
    <div ref={root} className="sqe-theme-reference" role="img" aria-label={theme.name}
      style={{width: "100%", height: width * .72, aspectRatio: "auto", overflow: "hidden", background: theme.bg}}>
      {visible && home && <div aria-hidden="true" style={{position: "absolute", width: 1200, height: 864, transform: `scale(${width / 1200})`, transformOrigin: "top left", pointerEvents: "none"}}>
        <PreviewCanvas {...context} state={draft} activePage={home}
          device="desktop" surface="page" revision={1} contentRevision={1} thumbnail previewOnly
          onSurfaceChange={noop} onAcknowledged={noop} onSelectSection={noop} onNavigatePage={noop}
          onAddSection={noop} onMoveSection={noop} onToggleSection={noop} onDeleteSection={noop}
          onHoverSection={noop} onEditElement={noop} onClearSelection={noop} />
      </div>}
    </div>
  );
}
