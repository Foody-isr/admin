"use client";

import { useState } from "react";
import { File, Images, MapPin, Utensils, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type PageTemplate = "blank" | "about" | "gallery" | "locations";

/** Chooses a page template in context and previews it before adding it to the site. */
export function PageLibrary({
  onPreview,
  onAdd,
  onClose,
  onCommerce,
}: {
  onPreview: (
    template: PageTemplate | null,
    title?: string,
    navigation?: boolean,
  ) => void;
  onAdd: () => void;
  onClose: () => void;
  onCommerce: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<PageTemplate | null>(null);
  const [navigation, setNavigation] = useState(true);
  const templates = [
    { id: "locations", label: "editorTemplateLocations", icon: MapPin },
    { id: "about", label: "editorTemplateAbout", icon: File },
    { id: "gallery", label: "editorTemplateGallery", icon: Images },
    { id: "blank", label: "editorTemplateBlank", icon: File },
  ] as const;
  return (
    <>
      <div className="sqe-panel-top sqe-panel-top--context">
        <button
          className="sqe-icon-button"
          aria-label={t("editorClose")}
          onClick={() => {
            onPreview(null);
            onClose();
          }}
        >
          <X size={20} />
        </button>
        <h2>{t("editorAddPage")}</h2>
        <button
          className="sqe-button"
          disabled={!selected}
          onClick={() => {
            onAdd();
            onClose();
          }}
        >
          {t("editorAdd")}
        </button>
      </div>
      <p className="sqe-panel-body">{t("editorTemplateHint")}</p>
      <div className="sqe-page-template-grid">
        {templates.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={selected === id}
            onClick={() => {
              setSelected(id);
              onPreview(id, t(label), navigation);
            }}
          >
            <span className={`sqe-page-template sqe-page-template--${id}`}>
              <Icon size={30} />
              <i />
              <i />
              <i />
            </span>
            <strong>{t(label)}</strong>
          </button>
        ))}
      </div>
      <label className="sqe-page-navigation">
        <input
          type="checkbox"
          checked={navigation}
          onChange={(event) => {
            setNavigation(event.target.checked);
            if (selected)
              onPreview(
                selected,
                t(
                  templates.find((template) => template.id === selected)!.label,
                ),
                event.target.checked,
              );
          }}
        />
        {t("editorAddNavigation")}
      </label>
      <button
        className="sqe-library-item"
        onClick={() => {
          onPreview(null);
          onClose();
          onCommerce();
        }}
      >
        <Utensils size={20} />
        {t("editorOnlineMenu")}
      </button>
    </>
  );
}
