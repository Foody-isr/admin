"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { normalizeSlug, pageAddressIsEditable } from "@/lib/website-v3/state";
import {
  isReservedPublicSlug,
  publicAddressForPage,
} from "@/lib/website-v3/url-model";
import { pageKey, type DraftPagePayload } from "@/lib/website-v3/types";
import { ImageUploadField } from "./SectionContentEditors";

/** Stages page metadata locally until Save; closing or Cancel never autosaves it. */
export function PageSettingsDialog({
  page,
  pages,
  restaurantId,
  onClose,
  onSave,
}: {
  page: DraftPagePayload;
  pages: DraftPagePayload[];
  restaurantId: number;
  onClose: () => void;
  onSave: (page: DraftPagePayload) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(page);
  const [tab, setTab] = useState("general");
  const slug = normalizeSlug(draft.slug);
  const editable = pageAddressIsEditable(page) && !page.is_homepage;
  const valid =
    draft.title.trim().length > 0 &&
    (!editable ||
      (Boolean(slug) &&
        !isReservedPublicSlug(slug) &&
        !pages.some(
          (other) =>
            pageKey(other) !== pageKey(page) &&
            normalizeSlug(other.slug) === slug,
        )));
  const seo = (key: string, value: string) =>
    setDraft((current) => ({
      ...current,
      seo: { ...current.seo, [key]: value },
    }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sqe-page-settings" aria-describedby={undefined}>
        <div className="sqe-settings-top">
          <button className="sqe-button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            className="sqe-button sqe-button--primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                ...draft,
                title: draft.title.trim(),
                slug: editable ? slug : page.slug,
              })
            }
          >
            {t("save")}
          </button>
        </div>
        <DialogTitle>{t("editorPageSettings")}</DialogTitle>
        <div className="sqe-settings-layout">
          <div role="tablist" aria-label={t("editorPageSettings")}>
            {["general", "seo", "social"].map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {t(`editorPageTab_${value}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="sqe-settings-fields">
            {tab === "general" && (
              <>
                <label>
                  {t("editorPageName")}
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  {t("editorPageUrl")}
                  <input
                    disabled={!editable}
                    value={editable ? draft.slug : publicAddressForPage(page)}
                    onChange={(event) =>
                      setDraft({ ...draft, slug: event.target.value })
                    }
                  />
                </label>
                {!valid && <p role="alert">{t("editorInvalidPage")}</p>}
                <label className="sqe-settings-check">
                  <input
                    type="checkbox"
                    checked={draft.nav_visible}
                    onChange={(event) =>
                      setDraft({ ...draft, nav_visible: event.target.checked })
                    }
                  />
                  {t("editorAddNavigation")}
                </label>
              </>
            )}
            {tab === "seo" && (
              <>
                <div className="sqe-search-preview">
                  <strong>{String(draft.seo?.title || draft.title)}</strong>
                  <span>{publicAddressForPage(draft)}</span>
                  <p>{String(draft.seo?.description || "")}</p>
                </div>
                <label>
                  {t("editorSeoTitle")}
                  <input
                    value={String(draft.seo?.title ?? "")}
                    onChange={(event) => seo("title", event.target.value)}
                  />
                  <small>{String(draft.seo?.title ?? "").length}/60</small>
                </label>
                <label>
                  {t("editorSeoDescription")}
                  <textarea
                    value={String(draft.seo?.description ?? "")}
                    onChange={(event) => seo("description", event.target.value)}
                  />
                  <small>
                    {String(draft.seo?.description ?? "").length}/130
                  </small>
                </label>
              </>
            )}
            {tab === "social" && (
              <>
                <ImageUploadField
                  restaurantId={restaurantId}
                  label={t("editorSocialImage")}
                  currentUrl={String(draft.seo?.share_image_url ?? "")}
                  onUploaded={(url) => seo("share_image_url", url)}
                  onRemove={() => seo("share_image_url", "")}
                />
                <div className="sqe-search-preview">
                  <strong>{String(draft.seo?.title || draft.title)}</strong>
                  <p>{String(draft.seo?.description || "")}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
