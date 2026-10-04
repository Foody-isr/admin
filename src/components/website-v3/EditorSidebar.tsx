"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { SECTION_TYPE_META } from "@/components/website/SectionEditors";
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
import { componentGroupsForPage } from "./PreviewCanvas";

type Panel = "outline" | "pages" | "inspector" | "library" | "design";

/** A single contextual sidebar for pages, section editing and global design. */
export function EditorSidebar({
  restaurantId,
  state,
  activePage,
  selection,
  tab,
  busy,
  inspector,
  design,
  alerts,
  onTabChange,
  onSelectSite,
  onSelectPage,
  onSelectSection,
  onAddPage,
  onAddSection,
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
  design: (onEditShared: () => void) => ReactNode;
  alerts: ReactNode;
  onTabChange: (tab: InspectorTab) => void;
  onSelectSite: () => void;
  onSelectPage: (key: string) => void;
  onSelectSection: (key: string) => void;
  onAddPage: () => void;
  onAddSection: (type: string) => void;
  onDuplicatePage: (key: string) => void;
  onMovePage: (key: string, direction: -1 | 1) => void;
  onDeletePage: (key: string) => void;
  onMoveSection: (key: string, direction: -1 | 1) => void;
  onToggleSection: (key: string) => void;
  onDeleteSection: (key: string) => void;
}) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<Panel>("outline");
  const [sectionContentOpen, setSectionContentOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(true);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [pageMenu, setPageMenu] = useState<string | null>(null);
  const selectedSection =
    selection.kind === "section"
      ? state.sections.find((s) => sectionKey(s) === selection.sectionKey)
      : undefined;
  const selectedSectionKey = selectedSection
    ? sectionKey(selectedSection)
    : null;
  const activeKey = pageKey(activePage);
  const sections = state.sections
    .filter((s) =>
      s.page_id !== undefined
        ? s.page_id === activePage.id
        : s.page_tmp_id
          ? s.page_tmp_id === activePage.tmp_id
          : s.page === activePage.slug,
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  const groups = componentGroupsForPage(activePage.type, sections);
  useEffect(() => {
    if (selectedSectionKey) {
      setPanel("inspector");
      setSectionContentOpen(false);
      onTabChange("appearance");
    }
  }, [selectedSectionKey, selection, onTabChange]);
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
        } as Record<string, string>
      )[section.section_type] ??
        SECTION_TYPE_META[section.section_type]?.labelKey ??
        section.section_type,
    );
  const editSite = () => {
    onSelectSite();
    onTabChange("settings");
    setPanel("inspector");
  };
  const editPage = () => {
    onSelectPage(activeKey);
    onTabChange("settings");
    setPanel("inspector");
  };
  const done = () => {
    setPanel("outline");
    setRowMenu(null);
    setPendingSection(null);
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
            onClick={() => setPanel("design")}
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
          <button
            className="sqe-icon-button"
            aria-label={t("editorAddPage")}
            onClick={onAddPage}
          >
            <Plus size={24} />
          </button>
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
                ? sectionLabel(selectedSection)
                : selection.kind === "site"
                  ? t("editorNavigation")
                  : activePage.title}
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
                  <button
                    onClick={() => {
                      onDeleteSection(sectionKey(selectedSection));
                      setSectionMenu(false);
                      done();
                    }}
                  >
                    {t("editorDelete")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {panel === "library" ? (
          <button
            className="sqe-button"
            disabled={!pendingSection}
            onClick={() => {
              if (pendingSection) {
                onAddSection(pendingSection);
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
              if (sectionContentOpen && selectedSection) {
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
          <div className="sqe-section-row">
            <button onClick={editSite}>
              <PanelTop size={20} />
              {t("editorHeader")}
            </button>
          </div>
          {sections
            .filter((s) => s.section_type !== "footer")
            .map((s, index) => (
              <div
                key={sectionKey(s)}
                className={`sqe-section-row ${s.is_visible ? "" : "sqe-section-row--hidden"}`}
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
                      <button
                        onClick={() => {
                          onDeleteSection(sectionKey(s));
                          setRowMenu(null);
                        }}
                      >
                        {t("editorDelete")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          {sections.length === 0 && (
            <p className="sqe-panel-body">{t("editorEmptySections")}</p>
          )}
          <div className="sqe-section-row">
            <button
              onClick={() => {
                const footer = sections.find(
                  (s) => s.section_type === "footer",
                );
                if (footer) chooseSection(sectionKey(footer));
                else {
                  onSelectSite();
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
                        onSelectPage(pageKey(p));
                        done();
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
                              onSelectPage(pageKey(p));
                              onTabChange("settings");
                              setPanel("inspector");
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
                          {p.type !== "landing" && (
                            <>
                              <button
                                onClick={() => {
                                  onDuplicatePage(pageKey(p));
                                  done();
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
                <button className="sqe-page-create" onClick={onAddPage}>
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
          {groups.map((group, index) => (
            <section key={group.label}>
              <h3>
                {t(
                  ["editorOrganize", "editorSell", "editorInform"][index] ??
                    "editorContent",
                )}
              </h3>
              {group.items.map((item) => (
                <button
                  key={item.type}
                  className="sqe-library-item"
                  aria-pressed={pendingSection === item.type}
                  onClick={() => setPendingSection(item.type)}
                >
                  <SectionIcon type={item.type} />
                  {t(SECTION_TYPE_META[item.type]?.labelKey ?? item.label)}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
      {panel === "design" && design(editSite)}
      {panel === "inspector" && (
        <>
          {!selectedSection && (
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
          {selectedSection && !sectionContentOpen && (
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
              selectedSection && !sectionContentOpen && !customizeOpen,
            )}
          >
            {inspector}
          </div>
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
