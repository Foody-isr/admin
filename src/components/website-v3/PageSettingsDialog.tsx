"use client";

import type { Menu } from "@/lib/api";
import type { FieldError } from "@/lib/website-v3/types";
import { CommerceSelector } from "./CommerceSelector";
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
  menus = [],
  errors = [],
  onClose,
  onSave,
}: {
  page: DraftPagePayload;
  pages: DraftPagePayload[];
  restaurantId: number;
  menus?: Menu[];
  errors?: FieldError[];
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
              <PageGeneralSettings page={page} draft={draft} menus={menus} errors={errors} valid={valid} onChange={setDraft} />
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
                    data-field-id="page.seo.title"
                    value={String(draft.seo?.title ?? "")}
                    onChange={(event) => seo("title", event.target.value)}
                  />
                  <small>{String(draft.seo?.title ?? "").length}/60</small>
                </label>
                <label>
                  {t("editorSeoDescription")}
                  <textarea
                    data-field-id="page.seo.description"
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

/** Stages identity, navigation and menu associations without writing the draft. */
export function PageGeneralSettings({
  page,
  draft,
  menus,
  errors = [],
  valid = true,
  onChange,
}: {
  page: DraftPagePayload;
  draft: DraftPagePayload;
  menus: Menu[];
  errors?: FieldError[];
  valid?: boolean;
  onChange: (page: DraftPagePayload) => void;
}) {
  const { t } = useI18n();
  const editable = pageAddressIsEditable(page) && !page.is_homepage;
  return (
    <>
      <label>
        {t("editorPageName")}
        <input
          data-field-id="page.title"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label>
        {t("editorPageUrl")}
        <input
          data-field-id="page.slug"
          disabled={!editable}
          value={editable ? draft.slug : publicAddressForPage(page)}
          onChange={(event) => onChange({ ...draft, slug: event.target.value })}
        />
      </label>
      {!valid && <p role="alert">{t("editorInvalidPage")}</p>}
      {errors.map((error) => (
        <p role="alert" key={error.fieldId}>{error.message}</p>
      ))}
      <label className="sqe-settings-check selection-row">
        <input
          type="checkbox"
          data-field-id="page.nav_visible"
          checked={draft.nav_visible}
          onChange={(event) => onChange({ ...draft, nav_visible: event.target.checked })}
        />
        {t("editorAddNavigation")}
      </label>
      <label className="sqe-settings-check selection-row">
        <input
          type="checkbox"
          data-field-id="page.is_homepage"
          checked={draft.is_homepage}
          disabled={page.is_homepage}
          onChange={(event) => onChange({ ...draft, is_homepage: event.target.checked })}
        />
        {t("websiteV3Homepage")}
      </label>
      {(draft.type === "order" || draft.type === "catering") && (
        <label className="sqe-settings-check selection-row">
          <input
            type="checkbox"
            data-field-id="page.is_default"
            checked={draft.is_default}
            disabled={page.is_default}
            onChange={(event) => onChange({ ...draft, is_default: event.target.checked })}
          />
          {t(draft.type === "order" ? "websiteV3OrderPrimary" : "websiteV3CateringPrimary")}
        </label>
      )}
      {draft.type === "order" && (
        <CommerceSelector
          page={draft}
          menus={menus}
          error={errors.find((error) => error.fieldId === "page.settings.menu_ids")?.message}
          onChange={(menu_ids) => onChange({ ...draft, settings: { ...draft.settings, menu_ids } })}
        />
      )}
    </>
  );
}
