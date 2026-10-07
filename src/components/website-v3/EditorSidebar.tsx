"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftFromLine,
  ChevronDown,
  Columns3,
  Eye,
  EyeOff,
  Image,
  LayoutTemplate,
  MoreHorizontal,
  PanelTop,
  Plus,
  Search,
  Settings,
  Tag,
  Type,
  Utensils,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  SQUARE_COMPONENTS,
  squareLayouts,
} from "@/lib/website-v3/square-components";
import { canDeleteSection, sectionsForPage } from "@/lib/website-v3/section-operations";
import { isTechnicalSitePage } from "@/lib/website-v3/state";
import {
  pageKey,
  sectionKey,
  type DraftPagePayload,
  type DraftSectionPayload,
  type DraftStatePayload,
} from "@/lib/website-v3/types";
import type { RailSelection } from "./PageRail";
import type { InspectorTab } from "./Inspector";
import { PageLibrary, type PageTemplate } from "./PageLibrary";
import {
  ElementInspector,
  SectionElements,
  editorElementLabel,
} from "./ElementInspector";
import { EDITOR_ELEMENTS } from "@/lib/website-v3/editor-elements";
import type { StatePath } from "@/lib/website-v3/types";
import { componentGroupsForPage } from "./PreviewCanvas";

import type { OrderEditorRegion } from "@/lib/website-v3/editor-selection";

type Panel =
  "outline" | "pages" | "inspector" | "library" | "page-library" | "design";

/** A single contextual sidebar for pages, section editing and global design. */
export function EditorSidebar({
  restaurantId,
  state,
  activePage,
  selection,
  tab,
  busy,
  inspector,
  orderEditor,
  onSelectOrderRegion,
  design,
  alerts,
  onTabChange,
  hoveredSectionKey,
  onHoverSection,
  onSectionChange,
  onClearSelection,
  onSelectSite,
  onSelectPage,
  onSelectSection,
  onAddPage,
  onPageSettings,
  onMakeHomepage,
  onPreviewPage,
  onAddPageTemplate,
  onAddSection,
  onPreviewSection,
  onDuplicateSection,
  onReorderSection,
  onDuplicatePage,
  onMovePage,
  onDeletePage,
  onMoveSection,
  onToggleSection,
  onDeleteSection,
}: {
  restaurantId: number;
  state: DraftStatePayload;
  activePage: DraftPagePayload;
  selection: RailSelection;
  tab: InspectorTab;
  busy: boolean;
  inspector: ReactNode;
  orderEditor?: (region: OrderEditorRegion) => ReactNode;
  onSelectOrderRegion?: (region: OrderEditorRegion) => void;
  design: (onEditShared: () => void, initialScreen?: "root" | "colors") => ReactNode;
  alerts: ReactNode;
  onTabChange: (tab: InspectorTab) => void;
  onSelectSite: (region?: "header" | "footer") => void;
  onSelectPage: (key: string) => void;
  onSelectSection: (key: string, field?: string) => void;
  hoveredSectionKey: string | null;
  onHoverSection: (key: string | null) => void;
  onSectionChange: (key: string, path: StatePath, value: unknown) => void;
  onClearSelection: () => void;
  onAddPage: () => void;
  onPageSettings: (key: string) => void;
  onMakeHomepage: (key: string) => void;
  onPreviewPage: (
    template: PageTemplate | null,
    title?: string,
    navigation?: boolean,
  ) => void;
  onAddPageTemplate: () => void;
  onAddSection: (type: string, layout?: string) => void;
  onPreviewSection: (type: string | null, layout?: string) => void;
  onDuplicateSection: (key: string) => void;
  onReorderSection: (source: string, target: string) => void;
  onDuplicatePage: (key: string) => void;
  onMovePage: (key: string, direction: -1 | 1) => void;
  onDeletePage: (key: string) => void;
  onMoveSection: (key: string, direction: -1 | 1) => void;
  onToggleSection: (key: string) => void;
  onDeleteSection: (key: string) => void;
}) {
  const { t } = useI18n();
  const [designScreen, setDesignScreen] = useState<"root" | "colors">("root");
  useEffect(() => { const open = () => {setDesignScreen("colors"); setPanel("design");}; window.addEventListener("foody-edit-color-styles", open); return () => window.removeEventListener("foody-edit-color-styles", open); }, []);
  const [panel, setPanel] = useState<Panel>("outline");
  const [sectionContentOpen, setSectionContentOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(true);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [pendingLayout, setPendingLayout] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [pageMenu, setPageMenu] = useState<string | null>(null);
  const selectedSection =
    selection.kind === "section"
      ? state.sections.find((s) => sectionKey(s) === selection.sectionKey)
      : undefined;
  const selectedSectionKey = selectedSection
    ? sectionKey(selectedSection)
    : null;
  const activeField =
    selection.kind === "section" ? selection.field : undefined;
  const orderRegion = selection.kind === "page" ? selection.region : undefined;
  const activeKey = pageKey(activePage);
  useEffect(() => { if (orderRegion) setPanel("inspector"); }, [orderRegion]);
  const sections = sectionsForPage(state, activePage);
  const groups = componentGroupsForPage(activePage.type);
  const lastSectionKey = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSectionKey) {
      setPanel("inspector");
      if (activeField || lastSectionKey.current !== selectedSectionKey) {
        setSectionContentOpen(Boolean(activeField));
        onTabChange(activeField ? "content" : "appearance");
      }
    }
    if (
      !selectedSectionKey &&
      lastSectionKey.current &&
      selection.kind === "page"
    )
      setPanel("outline");
    lastSectionKey.current = selectedSectionKey;
  }, [selectedSectionKey, activeField, selection.kind, onTabChange]);
  useEffect(() => {
    if (selection.kind === "site" && selection.region) setPanel("inspector");
  }, [selection]);
  useEffect(() => {
    setRowMenu(null);
    setPageMenu(null);
  }, [activeKey]);
  const sectionLabel = (section: DraftSectionPayload) =>
    t(
      (
        {
          hero_banner: "editorMainBanner",
          scrolling_text: "editorScrollingText",
          text_and_image: "editorTextImage",
          testimonials: "editorTestimonials",
          menu_highlights: "editorFeaturedItems",
          order_discovery: "editorFeaturedItems",
        } as Record<string, string>
      )[section.section_type] ??
        SQUARE_COMPONENTS[section.section_type]?.label ??
        section.section_type,
    );
  const editSite = (region?: "header" | "footer") => {
    onSelectSite(region);
    onTabChange("settings");
    setPanel("inspector");
  };
  const editPage = () => onPageSettings(activeKey);
  const done = () => {
    setPanel("outline");
    setRowMenu(null);
    setPendingSection(null);
    setPendingLayout(null);
    onPreviewSection(null);
    onClearSelection();
  };
  const chooseSection = (key: string) => {
    onSelectSection(key);
    onTabChange("appearance");
    setSectionContentOpen(false);
    setPanel("inspector");
  };
  const header =
    panel === "outline" || panel === "pages" ? (
      <>
        <div className="sqe-panel-top">
          <a
            href={`/${restaurantId}/dashboard`}
            className="sqe-icon-button"
            aria-label={t("editorExit")}
          >
            <ArrowLeftFromLine size={22} />
          </a>
          <button
            className="sqe-button sqe-design-button"
            onClick={() => {setDesignScreen("root"); setPanel("design");}}
          >
            {t("editorDesign")}
          </button>
        </div>
        <div className="sqe-page-switch">
          <button
            className="sqe-button"
            aria-expanded={panel === "pages"}
            onClick={() => setPanel(panel === "pages" ? "outline" : "pages")}
          >
            <span>{activePage.title}</span>
            <ChevronDown size={18} />
          </button>
          <button
            className="sqe-icon-button"
            aria-label={t("editorPageSettings")}
            onClick={editPage}
          >
            <Settings size={22} />
          </button>
          <div className="sqe-more">
            <button
              className="sqe-icon-button"
              aria-label={t("editorAdd")}
              aria-expanded={addMenu}
              onClick={() => setAddMenu(!addMenu)}
            >
              <Plus size={24} />
            </button>
            {addMenu && (
              <>
                <button
                  className="sqe-dismiss"
                  aria-label={t("editorClose")}
                  onClick={() => setAddMenu(false)}
                />
                <div className="sqe-menu">
                  <button
                    onClick={() => {
                      setPanel("library");
                      setAddMenu(false);
                    }}
                  >
                    {t("editorAddSection")}
                  </button>
                  <button
                    onClick={() => {
                      setPanel("page-library");
                      setAddMenu(false);
                    }}
                  >
                    {t("editorAddPage")}
                  </button>
                  <a
                    href={`/${restaurantId}/menu/items`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("editorAddItem")} ↗
                  </a>
                  <a
                    href={`/${restaurantId}/menu/categories`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("editorAddCategory")} ↗
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    ) : (
      <div className="sqe-panel-top sqe-panel-top--context">
        {panel === "library" && (
          <button
            className="sqe-icon-button"
            onClick={done}
            aria-label={t("editorClose")}
          >
            <X size={20} />
          </button>
        )}
        <h2>
          {panel === "design"
            ? t("editorDesign")
            : panel === "library"
              ? t("editorAddSection")
              : selectedSection
                ? activeField
                  ? editorElementLabel(activeField, t)
                  : sectionLabel(selectedSection)
                : selection.kind === "site"
                  ? t(
                      selection.region === "header"
                        ? "editorHeader"
                        : selection.region === "footer"
                          ? "editorFooter"
                          : "editorSettings",
                    )
                  : orderRegion ? t(orderRegion === "order-items" ? "editorItemList" : orderRegion === "order-banner" ? "editorMainBanner" : "editorOrderFulfillment") : activePage.title}
        </h2>
        {panel === "inspector" && selectedSection && (
          <div className="sqe-more">
            <button
              className="sqe-icon-button"
              aria-label={t("editorMore")}
              aria-expanded={sectionMenu}
              onClick={() => setSectionMenu(!sectionMenu)}
            >
              <MoreHorizontal size={20} />
            </button>
            {sectionMenu && (
              <>
                <button
                  className="sqe-dismiss"
                  aria-label={t("editorClose")}
                  onClick={() => setSectionMenu(false)}
                />
                <div className="sqe-menu">
                  <button
                    onClick={() => {
                      onTabChange("settings");
                      setSectionContentOpen(true);
                      setSectionMenu(false);
                    }}
                  >
                    {t("editorSettings")}
                  </button>
                  {selectedSection.section_type !== "footer" && (
                    <button
                      onClick={() => {
                        onDuplicateSection(sectionKey(selectedSection));
                        setSectionMenu(false);
                      }}
                    >
                      {t("editorDuplicate")}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onToggleSection(sectionKey(selectedSection));
                      setSectionMenu(false);
                    }}
                  >
                    {t(
                      selectedSection.is_visible ? "editorHide" : "editorShow",
                    )}
                  </button>

                </div>
              </>
            )}
          </div>
        )}
        {panel === "library" ? (
          <button
            className="sqe-button"
            disabled={!pendingSection || !pendingLayout}
            onClick={() => {
              if (pendingSection) {
                onAddSection(pendingSection, pendingLayout ?? "default");
                setPanel("inspector");
                setPendingSection(null);
              }
            }}
          >
            {t("editorAdd")}
          </button>
        ) : (
          <button
            className="sqe-button"
            onClick={() => {
              if (activeField && selectedSection) {
                onSelectSection(sectionKey(selectedSection));
                setSectionContentOpen(true);
                onTabChange("content");
              } else if (sectionContentOpen && selectedSection) {
                setSectionContentOpen(false);
                onTabChange("appearance");
              } else done();
            }}
          >
            {t("editorDone")}
          </button>
        )}
      </div>
    );
  if (panel === "page-library")
    return (
      <PageLibrary
        onPreview={onPreviewPage}
        onAdd={onAddPageTemplate}
        onClose={() => setPanel("outline")}
        onCommerce={onAddPage}
        hasShop={state.pages.some((page) => page.type === "order")}
      />
    );
  const pages = state.pages
    .filter(
      (p) =>
        !isTechnicalSitePage(p) &&
        p.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div
      aria-busy={busy}
      style={busy ? { pointerEvents: "none", opacity: 0.6 } : undefined}
    >
      {header}
      {alerts}
      {panel === "outline" && (
        <div className="sqe-outline">
          <div
            className="sqe-section-row"
            data-hovered={hoveredSectionKey === "site:header" || undefined}
            onMouseEnter={() => onHoverSection("site:header")}
            onMouseLeave={() => onHoverSection(null)}
          >
            <button onClick={() => editSite("header")}>
              <PanelTop size={20} />
              {t("editorHeader")}
            </button>
          </div>
          {activePage.type === "order" && ([
            ["order-banner", "editorMainBanner", Image],
            ["order-fulfillment", "editorOrderFulfillment", Utensils],
            ["order-items", "editorItemList", Columns3],
          ] as const).map(([region, label, Icon]) => <div key={region} className="sqe-section-row"
            data-hovered={hoveredSectionKey === `site:${region}` || undefined}
            onMouseEnter={() => onHoverSection(`site:${region}`)} onMouseLeave={() => onHoverSection(null)}>
            <button onClick={() => { onSelectOrderRegion?.(region); setPanel("inspector"); }}><Icon size={20} />{t(label)}</button>
          </div>)}
          {sections
            .filter((s) => s.section_type !== "footer")
            .map((s, index) => (
              <div
                key={sectionKey(s)}
                className={`sqe-section-row ${s.is_visible ? "" : "sqe-section-row--hidden"}`}
                data-hovered={hoveredSectionKey === sectionKey(s) || undefined}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/x-foody-section",
                    sectionKey(s),
                  )
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData(
                    "application/x-foody-section",
                  );
                  if (source) onReorderSection(source, sectionKey(s));
                }}
                onMouseEnter={() => onHoverSection(sectionKey(s))}
                onMouseLeave={() => onHoverSection(null)}
              >
                <button onClick={() => chooseSection(sectionKey(s))}>
                  <SectionIcon type={s.section_type} />
                  {sectionLabel(s)}
                </button>
                <button
                  className="sqe-icon-button sqe-row-more"
                  aria-label={`${t("editorMore")} : ${sectionLabel(s)}`}
                  aria-expanded={rowMenu === sectionKey(s)}
                  onClick={() =>
                    setRowMenu(rowMenu === sectionKey(s) ? null : sectionKey(s))
                  }
                >
                  <MoreHorizontal size={20} />
                </button>
                {rowMenu === sectionKey(s) && (
                  <>
                    <button
                      className="sqe-dismiss"
                      aria-label={t("editorClose")}
                      onClick={() => setRowMenu(null)}
                    />
                    <div className="sqe-menu">
                      <button
                        disabled={index === 0}
                        onClick={() => {
                          onMoveSection(sectionKey(s), -1);
                          setRowMenu(null);
                        }}
                      >
                        {t("editorMoveUp")}
                      </button>
                      <button
                        disabled={
                          index ===
                          sections.filter(
                            (section) => section.section_type !== "footer",
                          ).length -
                            1
                        }
                        onClick={() => {
                          onMoveSection(sectionKey(s), 1);
                          setRowMenu(null);
                        }}
                      >
                        {t("editorMoveDown")}
                      </button>
                      <button
                        onClick={() => {
                          onToggleSection(sectionKey(s));
                          setRowMenu(null);
                        }}
                      >
                        {s.is_visible ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}{" "}
                        {t(s.is_visible ? "editorHide" : "editorShow")}
                      </button>
                      {canDeleteSection(s) && <button
                        onClick={() => {
                          onDeleteSection(sectionKey(s));
                          setRowMenu(null);
                        }}
                      >
                        {t("editorDelete")}
                      </button>}
                    </div>
                  </>
                )}
              </div>
            ))}
          {sections.length === 0 && activePage.type !== "order" && (
            <p className="sqe-panel-body">{t("editorEmptySections")}</p>
          )}
          <div
            className="sqe-section-row"
            data-hovered={hoveredSectionKey === "site:footer" || undefined}
            onMouseEnter={() => onHoverSection("site:footer")}
            onMouseLeave={() => onHoverSection(null)}
          >
            <button
              onClick={() => {
                const footer = sections.find(
                  (s) => s.section_type === "footer",
                );
                if (footer) chooseSection(sectionKey(footer));
                else {
                  onSelectSite("footer");
                  onTabChange("content");
                  setPanel("inspector");
                }
              }}
            >
              <PanelTop size={20} />
              {t("editorFooter")}
            </button>
          </div>
          {groups.length > 0 && (
            <button
              className="sqe-add-section"
              onClick={() => {
                setPendingSection(null);
                setPanel("library");
              }}
            >
              <Plus size={20} />
              {t("editorAddSection")}
            </button>
          )}
        </div>
      )}
      {panel === "pages" && (
        <div className="sqe-pages">
          <label className="sqe-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("editorSearchPages")}
              aria-label={t("editorSearchPages")}
            />
          </label>
          {(
            [
              ["editorStandardPages", ["landing", "content"]],
              ["editorOnlineMenu", ["order"]],
              ["editorCatering", ["catering"]],
            ] as const
          ).map(([label, types]) => (
            <section className="sqe-pages-group" key={label}>
              <h3>{t(label)}</h3>
              {pages
                .filter((p) => (types as readonly string[]).includes(p.type))
                .map((p) => (
                  <div
                    key={pageKey(p)}
                    className="sqe-page-item"
                    aria-current={pageKey(p) === activeKey}
                    style={{ position: "relative" }}
                  >
                    <button
                      onClick={() => {
                        done();
                        onSelectPage(pageKey(p));
                      }}
                    >
                      {p.title}
                    </button>
                    <button
                      className="sqe-icon-button"
                      aria-label={`${t("editorMore")} : ${p.title}`}
                      onClick={() =>
                        setPageMenu(pageMenu === pageKey(p) ? null : pageKey(p))
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {pageMenu === pageKey(p) && (
                      <>
                        <button
                          className="sqe-dismiss"
                          aria-label={t("editorClose")}
                          onClick={() => setPageMenu(null)}
                        />
                        <div className="sqe-menu">
                          <button
                            onClick={() => {
                              onPageSettings(pageKey(p));
                              setPageMenu(null);
                            }}
                          >
                            {t("editorPageSettings")}
                          </button>
                          <button
                            onClick={() => {
                              onMovePage(pageKey(p), -1);
                              setPageMenu(null);
                            }}
                          >
                            {t("editorMoveUp")}
                          </button>
                          <button
                            onClick={() => {
                              onMovePage(pageKey(p), 1);
                              setPageMenu(null);
                            }}
                          >
                            {t("editorMoveDown")}
                          </button>
                          {!p.is_homepage && (
                            <button
                              onClick={() => {
                                onMakeHomepage(pageKey(p));
                                setPageMenu(null);
                              }}
                            >
                              {t("editorMakeHomepage")}
                            </button>
                          )}
                          {p.type !== "landing" && (
                            <>
                              <button
                                onClick={() => {
                                  done();
                                  onDuplicatePage(pageKey(p));
                                }}
                              >
                                {t("editorDuplicate")}
                              </button>
                              <button
                                onClick={() => {
                                  onDeletePage(pageKey(p));
                                  setPageMenu(null);
                                }}
                              >
                                {t("editorDelete")}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              {label === "editorStandardPages" && (
                <button
                  className="sqe-page-create"
                  onClick={() => setPanel("page-library")}
                >
                  ＋ {t("editorAddPage")}
                </button>
              )}
            </section>
          ))}
          {pages.length === 0 && (
            <p className="sqe-panel-body">{t("editorNoPages")}</p>
          )}
        </div>
      )}
      {panel === "library" && (
        <div className="sqe-section-library">
          {groups.map((group) => (
            <section key={group.label}>
              <h3>{t(group.label)}</h3>
              {group.items.map((item) => (
                <div
                  key={item.type}
                  className={`sqe-library-card ${pendingSection === item.type ? "is-selected" : ""}`}
                >
                  <button
                    className="sqe-library-item"
                    aria-pressed={pendingSection === item.type}
                    onClick={() => {
                      setPendingSection(item.type);
                      setPendingLayout(item.layouts[0]);
                      onPreviewSection(item.type, item.layouts[0]);
                    }}
                  >
                    <SectionIcon type={item.type} />
                    {t(item.label)}
                  </button>
                  {pendingSection === item.type && (
                    <div className="sqe-library-layouts">
                      <div className="sqe-layout-choices">
                        {squareLayouts(item.type).map((layout) => (
                          <button
                            key={layout.value}
                            className="sqe-layout-choice"
                            aria-label={t(layout.labelKey)}
                            aria-pressed={pendingLayout === layout.value}
                            onClick={() => {
                              setPendingLayout(layout.value);
                              onPreviewSection(item.type, layout.value);
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={`sqe-layout-mini sqe-layout-mini--${layout.value}`}
                            >
                              <i />
                              <i />
                              <i />
                              <b />
                            </span>
                            <span>{t(layout.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {panel === "design" && design(() => editSite(), designScreen)}
      {panel === "inspector" && orderRegion && orderEditor ? orderEditor(orderRegion) : panel === "inspector" && (
        <>
          {!selectedSection &&
            !(selection.kind === "site" && selection.region === "header") && (
              <div className="sqe-tabs" role="tablist">
                {(
                  [
                    ["content", "editorContent"],
                    ["appearance", "editorCustomize"],
                    ["settings", "editorSettings"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    role="tab"
                    aria-selected={tab === value}
                    key={value}
                    onClick={() => onTabChange(value)}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            )}
          {selectedSection && !["menu_highlights", "featured_menu"].includes(selectedSection.section_type) && !sectionContentOpen && (
            <>
              <section className="sqe-section-content">
                <h3>{t("editorContent")}</h3>
                <button
                  className="sqe-content-edit"
                  onClick={() => {
                    setSectionContentOpen(true);
                    onTabChange("content");
                  }}
                >
                  {typeof selectedSection.content.image_url === "string" &&
                  selectedSection.content.image_url ? (
                    <span
                      className="sqe-content-thumb"
                      style={{
                        backgroundImage: `url(${JSON.stringify(selectedSection.content.image_url)})`,
                      }}
                    />
                  ) : (
                    <SectionIcon type={selectedSection.section_type} />
                  )}
                  {t("editorEditContent")}
                </button>
              </section>
              <button
                className="sqe-customize-toggle"
                aria-expanded={customizeOpen}
                onClick={() => setCustomizeOpen(!customizeOpen)}
              >
                {t("editorCustomize")}
                <ChevronDown
                  size={18}
                  style={{
                    transform: customizeOpen ? "rotate(180deg)" : undefined,
                  }}
                />
              </button>
            </>
          )}
          <div
            className="sqe-inspector"
            hidden={Boolean(
              selectedSection && !["menu_highlights", "featured_menu"].includes(selectedSection.section_type) && !sectionContentOpen && !customizeOpen,
            )}
          >
            {selectedSection && activeField ? (
              <ElementInspector
                restaurantId={restaurantId}
                section={selectedSection}
                field={activeField}
                onChange={(path, value) =>
                  onSectionChange(sectionKey(selectedSection), path, value)
                }
              />
            ) : selectedSection &&
              sectionContentOpen &&
              tab === "content" &&
              EDITOR_ELEMENTS[selectedSection.section_type] ? (
              <SectionElements
                section={selectedSection}
                onSelect={onSelectSection}
                onChange={(path, value) =>
                  onSectionChange(sectionKey(selectedSection), path, value)
                }
              />
            ) : (
              inspector
            )}
          </div>
          {selectedSection && canDeleteSection(selectedSection) && (
            <div className="sqe-panel-body sqe-section-delete">
              <button className="sqe-button sqe-button-secondary" disabled={busy}
                onClick={() => onDeleteSection(sectionKey(selectedSection))}>
                {t("editorDeleteSection")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Uses one small outline icon per kind of content. */
export function SectionIcon({ type }: { type: string }) {
  const Icon =
    type === "menu_highlights"
      ? Tag
      : type === "scrolling_text"
        ? Type
        : type === "text_and_image" ||
            type === "gallery" ||
            type === "hero_banner"
          ? Image
          : type === "order_discovery"
            ? Utensils
            : type === "feature_cards"
              ? Columns3
              : LayoutTemplate;
  return <Icon size={20} aria-hidden="true" />;
}
