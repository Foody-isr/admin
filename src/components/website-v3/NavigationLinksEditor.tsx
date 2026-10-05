"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type {
  DraftPagePayload,
  DraftSectionPayload,
} from "@/lib/website-v3/types";
import { sectionBelongs } from "@/lib/website-v3/section-operations";
import { SQUARE_COMPONENTS } from "@/lib/website-v3/square-components";

type NavLink = {
  id: string;
  label: string;
  page_slug?: string;
  anchor?: string;
  url?: string;
};
/** Navigation links are independent of pages; deleting a link never deletes its page. */
export function NavigationLinksEditor({
  pages,
  sections,
  value,
  onChange,
}: {
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
  value: unknown;
  onChange: (links: NavLink[]) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const links: NavLink[] = Array.isArray(value)
    ? value
    : pages
        .filter((page) => page.nav_visible)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((page) => ({
          id: `page-${page.id ?? page.tmp_id}`,
          label: page.title,
          page_slug: page.slug,
        }));
  const patch = (id: string, change: Partial<NavLink>) =>
    onChange(
      links.map((link) => (link.id === id ? { ...link, ...change } : link)),
    );
  const move = (index: number, direction: number) => {
    const next = [...links];
    const [link] = next.splice(index, 1);
    next.splice(index + direction, 0, link);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {links.map((link, index) => {
        const page = pages.find((page) => page.slug === link.page_slug);
        return (
          <div key={link.id} className="sqe-nav-link">
            <div className="flex items-center gap-1">
              <button
                className="flex-1 text-start py-3"
                onClick={() =>
                  setSelected(selected === link.id ? null : link.id)
                }
              >
                {link.label}
              </button>
              <button
                className="sqe-icon-button"
                aria-label={t("editorMoveUp")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="sqe-icon-button"
                aria-label={t("editorMoveDown")}
                disabled={index === links.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                className="sqe-icon-button"
                aria-label={t("editorRemoveLink")}
                onClick={() =>
                  onChange(links.filter((value) => value.id !== link.id))
                }
              >
                <X size={16} />
              </button>
            </div>
            {selected === link.id && (
              <div className="space-y-4 pb-4">
                <label className="sqe-field">
                  {t("editorLinkLabel")}
                  <input
                    value={link.label}
                    onChange={(e) => patch(link.id, { label: e.target.value })}
                  />
                </label>
                <label className="sqe-field">
                  {t("editorField_cta_link")}
                  <select
                    value={link.page_slug ?? "external"}
                    onChange={(e) =>
                      patch(
                        link.id,
                        e.target.value === "external"
                          ? {
                              page_slug: undefined,
                              anchor: undefined,
                              url: "https://",
                            }
                          : {
                              page_slug: e.target.value,
                              anchor: undefined,
                              url: undefined,
                            },
                      )
                    }
                  >
                    <option value="external">{t("editorLinkExternal")}</option>
                    {pages.map((page) => (
                      <option key={page.slug} value={page.slug}>
                        {page.title}
                      </option>
                    ))}
                  </select>
                </label>
                {page ? (
                  <label className="sqe-field">
                    {t("editorLinkSection")}
                    <select
                      value={link.anchor ?? ""}
                      onChange={(e) =>
                        patch(link.id, { anchor: e.target.value || undefined })
                      }
                    >
                      <option value="">—</option>
                      {sections
                        .filter(
                          (section) =>
                            sectionBelongs(section, page) && section.is_visible,
                        )
                        .map((section) => {
                          const anchor = String(
                            section.settings.anchor ||
                              `section-${section.id ?? section.tmp_id}`,
                          );
                          return (
                            <option key={anchor} value={anchor}>
                              {String(
                                section.content.title ||
                                  section.content.headline ||
                                  t(
                                    SQUARE_COMPONENTS[section.section_type]
                                      ?.label ?? section.section_type,
                                  ),
                              )}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                ) : (
                  <label className="sqe-field">
                    URL
                    <input
                      type="url"
                      value={link.url ?? ""}
                      onChange={(e) => patch(link.id, { url: e.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        className="sqe-button"
        onClick={() => {
          const id = crypto.randomUUID();
          onChange([
            ...links,
            {
              id,
              label: pages[0]?.title ?? t("editorLinkLabel"),
              page_slug: pages[0]?.slug,
            },
          ]);
          setSelected(id);
        }}
      >
        <Plus size={16} />
        {t("editorAddLink")}
      </button>
    </div>
  );
}
