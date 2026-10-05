"use client";
import { useState } from "react";
import { File, Images, MapPin, Utensils, X, Mail, Home } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type PageTemplate =
  "blank" | "about" | "gallery" | "locations" | "menu" | "contact" | "home";
const templates = [
  {
    id: "locations",
    label: "editorTemplateLocations",
    icon: MapPin,
    group: "editorThemeTemplates",
  },
  {
    id: "menu",
    label: "editorTemplateMenu",
    icon: Utensils,
    group: "editorThemeTemplates",
  },
  {
    id: "about",
    label: "editorTemplateAbout",
    icon: File,
    group: "editorThemeTemplates",
  },
  {
    id: "blank",
    label: "editorTemplateBlank",
    icon: File,
    group: "editorMore",
  },
  {
    id: "contact",
    label: "editorTemplateContact",
    icon: Mail,
    group: "editorMore",
  },
  {
    id: "gallery",
    label: "editorTemplateGallery",
    icon: Images,
    group: "editorMore",
  },
  { id: "home", label: "editorTemplateHome", icon: Home, group: "editorMore" },
] as const;

/** Previews a named page before committing its content and navigation choice together. */
export function PageLibrary({
  onPreview,
  onAdd,
  onClose,
  onCommerce,
  hasShop,
}: {
  onPreview: (
    template: PageTemplate | null,
    title?: string,
    navigation?: boolean,
  ) => void;
  onAdd: () => void;
  onClose: () => void;
  onCommerce: () => void;
  hasShop: boolean;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<PageTemplate | null>(null);
  const [navigation, setNavigation] = useState(true);
  const [name, setName] = useState("");
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
          disabled={!selected || !name.trim()}
          onClick={() => {
            onAdd();
            onClose();
          }}
        >
          {t("editorAdd")}
        </button>
      </div>
      <p className="sqe-panel-body">{t("editorTemplateHint")}</p>
      {selected && (
        <div className="sqe-panel-body">
          <label className="sqe-field">
            {t("editorPageName")}
            <input
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                onPreview(selected, e.target.value, navigation);
              }}
            />
          </label>
          <label className="sqe-page-navigation">
            <input
              type="checkbox"
              checked={navigation}
              onChange={(e) => {
                setNavigation(e.target.checked);
                onPreview(selected, name, e.target.checked);
              }}
            />
            {t("editorAddNavigation")}
          </label>
        </div>
      )}
      {["editorThemeTemplates", "editorRecommended", "editorMore"].map(
        (group) => (
          <section key={group} className="sqe-section-library">
            <h3>{t(group)}</h3>
            {group === "editorRecommended" ? (
              <button
                className="sqe-library-item"
                disabled={hasShop}
                onClick={() => {
                  onPreview(null);
                  onClose();
                  onCommerce();
                }}
              >
                <Utensils size={20} />
                {t("editorShop")}
                {hasShop && <small>{t("editorAdded")}</small>}
              </button>
            ) : (
              <div className="sqe-page-template-grid">
                {templates
                  .filter((template) => template.group === group)
                  .map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      aria-pressed={selected === id}
                      onClick={() => {
                        setSelected(id);
                        setName(t(label));
                        onPreview(id, t(label), navigation);
                      }}
                    >
                      <span
                        className={`sqe-page-template sqe-page-template--${id}`}
                      >
                        <Icon size={30} />
                        <i />
                        <i />
                        <i />
                      </span>
                      <strong>{t(label)}</strong>
                    </button>
                  ))}
              </div>
            )}
          </section>
        ),
      )}
    </>
  );
}
