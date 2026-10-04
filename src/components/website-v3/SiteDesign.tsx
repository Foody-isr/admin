"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { loadWebsiteFont } from "@/lib/website-fonts";
import type { ThemeCatalog } from "@/lib/api";
import type { DraftStatePayload } from "@/lib/website-v3/types";
import {
  RESTAURANT_THEMES,
  applyRestaurantTheme,
  record,
  type RestaurantTheme,
} from "@/lib/website-v3/restaurant-themes";

type Screen =
  | "root"
  | "colors"
  | "fonts"
  | "styles"
  | "themes"
  | "detail"
  | "buttons";

/** Global site design with non-destructive theme previews and an explicit apply action. */
export function SiteDesign({
  state,
  catalog,
  restaurantName,
  description,
  image,
  onChange,
  onPreview,
  onApplied,
  onEditShared,
}: {
  state: DraftStatePayload;
  catalog: ThemeCatalog;
  restaurantName: string;
  description: string;
  image: string;
  onChange: (state: DraftStatePayload) => void;
  onPreview: (state: DraftStatePayload | null) => void;
  onEditShared: () => void;
  onApplied: (state: DraftStatePayload) => void;
}) {
  const { t } = useI18n();
  const [screen, setScreen] = useState<Screen>("root");
  const [candidate, setCandidate] = useState<RestaurantTheme | null>(null);
  const [allPages, setAllPages] = useState(false);
  const [compose, setCompose] = useState(false);
  const [ordering, setOrdering] = useState(false);
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
      RESTAURANT_THEMES.forEach((theme) => loadWebsiteFont(theme.heading));
    }
  }, [screen]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => {
    if (!candidate) {
      onPreview(null);
      return;
    }
    onPreview(
      applyRestaurantTheme(state, candidate, {
        allPages,
        compose,
        orderingOnly: ordering,
        title: restaurantName,
        description,
        image,
        cta: t("editorOrderNow"),
        createId: () => `section-${crypto.randomUUID()}`,
      }),
    );
  }, [
    candidate,
    state,
    allPages,
    compose,
    ordering,
    restaurantName,
    description,
    image,
    onPreview,
    t,
  ]);
  const patch = (value: Record<string, unknown>) =>
    onChange({ ...state, config: { ...state.config, ...value } });
  const patchSite = (value: Record<string, unknown>) =>
    patch({ typography: { ...typography, site: { ...site, ...value } } });
  const previewTheme = (theme: RestaurantTheme, withLayout = false) => {
    setCompose(withLayout);
    setCandidate(theme);
    setScreen("detail");
  };
  const apply = () => {
    if (!candidate) return;
    const next = applyRestaurantTheme(state, candidate, {
      allPages,
      compose,
      orderingOnly: ordering,
      title: restaurantName,
      description,
      image,
      cta: t("editorOrderNow"),
      createId: () => `section-${crypto.randomUUID()}`,
    });
    onChange(next);
    onApplied(next);
    onPreview(null);
    setCandidate(null);
    setScreen("root");
  };
  const back = () => {
    setCandidate(null);
    onPreview(null);
    setScreen("root");
  };
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
              {[accent, bg, ink].map((color, index) => (
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
              {t("editorNavigation")}
              <ChevronRight size={18} />
            </button>
          </section>
        </div>
      )}
      {screen === "colors" && (
        <div className="sqe-panel-body">
          <h3>{t("editorColors")}</h3>
          {(
            [
              ["accent", "editorMainColor", accent],
              ["bg", "editorBackground", bg],
              ["surface", "editorSurface", surface],
              ["ink", "editorText", ink],
            ] as const
          ).map(([key, label, value]) => (
            <div key={key}>
              <label htmlFor={`site-${key}`}>{t(label)}</label>
              <div className="sqe-color-field">
                <input
                  id={`site-${key}`}
                  aria-label={t(label)}
                  type="color"
                  value={value}
                  onChange={(e) =>
                    patch({
                      theme_id: "custom",
                      custom_palette: {
                        mode: palette.mode ?? currentTheme?.mode ?? "light",
                        bg,
                        surface,
                        ink,
                        accent,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
                <span>{value.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
          <div className="sqe-style-grid">
            {RESTAURANT_THEMES.map((theme) => (
              <button
                key={theme.id}
                aria-label={theme.name}
                onClick={() => previewTheme(theme)}
                style={{
                  background: theme.bg,
                  color: theme.ink,
                  fontFamily: theme.heading,
                }}
              >
                <strong>Aa</strong>
                <i style={{ background: theme.accent }} />
              </button>
            ))}
          </div>
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
                    <ThemeThumbnail
                      theme={theme}
                      name={restaurantName}
                      image={image}
                      headline={t("editorWelcome")}
                      cta={t("editorOrderNow")}
                    />
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
          <p>{t("editorThemePreserve")}</p>
          <label className="sqe-field">
            <input
              type="checkbox"
              checked={allPages}
              onChange={(e) => setAllPages(e.target.checked)}
            />{" "}
            {t("editorThemeScope")}
          </label>
          {allPages && <p>{t("editorThemeScopeHint")}</p>}
          {!ordering && (
            <label className="sqe-field">
              <span>{t("editorLayout")}</span>
              <select
                value={compose ? "compose" : "style"}
                onChange={(e) => setCompose(e.target.value === "compose")}
              >
                <option value="style">{t("editorThemeStyleOnly")}</option>
                <option value="compose">{t("editorThemeCompose")}</option>
              </select>
            </label>
          )}
          <button className="sqe-button sqe-button--primary" onClick={apply}>
            {t("editorUseTheme")}
          </button>
          <div className="sqe-style-grid" style={{ marginTop: 32 }}>
            {RESTAURANT_THEMES.filter(
              (theme) => !ordering || theme.ordering,
            ).map((theme) => (
              <button
                key={theme.id}
                aria-label={theme.name}
                aria-pressed={candidate.id === theme.id}
                style={{
                  background: theme.bg,
                  color: theme.ink,
                  fontFamily: theme.heading,
                }}
                onClick={() => setCandidate(theme)}
              >
                <strong>Aa</strong>
                <i style={{ background: theme.accent }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ThemeThumbnail({
  theme,
  name,
  image,
  headline,
  cta,
}: {
  theme: RestaurantTheme;
  name: string;
  image: string;
  headline: string;
  cta: string;
}) {
  return (
    <div
      className="sqe-theme-preview"
      style={{ background: theme.bg, color: theme.ink }}
    >
      <div className="sqe-theme-nav">
        <strong>{name}</strong>
        <span>{cta}　☰</span>
      </div>
      <div
        className="sqe-theme-hero"
        style={
          theme.hero !== "split" && image
            ? {
                backgroundImage: `linear-gradient(#0003,#0003),url(${JSON.stringify(image)})`,
                color: "white",
              }
            : {}
        }
      >
        <div>
          <h2 style={{ fontFamily: theme.heading }}>{headline}</h2>
          <span
            style={{
              background: theme.accent,
              color: theme.mode === "dark" ? theme.bg : "white",
              borderRadius:
                theme.shape === "square"
                  ? 0
                  : theme.shape === "rounded"
                    ? 6
                    : 24,
            }}
          >
            {cta}
          </span>
        </div>
        {theme.hero === "split" &&
          (image ? (
            <div
              style={{
                width: "45%",
                alignSelf: "stretch",
                background: `center/cover url(${JSON.stringify(image)})`,
              }}
            />
          ) : (
            <ImageIcon size={64} strokeWidth={1} />
          ))}
      </div>
    </div>
  );
}
