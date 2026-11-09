"use client";

import { useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Download, Image, List, PanelBottom, PanelTop, Plus, Search, Trash2 } from "lucide-react";
import { localizedCopy, useI18n } from "@/lib/i18n";
import {
  defaultMobileExperience, mobileIcons, mobileTargets, type InstallCopy, type InstallPlacement, type MobileCopy,
  type MobileExperience, type MobileLocale, type MobileNavigationColors, type MobileNavigationItem, type MobilePreview,
} from "@/lib/website-v3/mobile-experience";
import { isTechnicalSitePage } from "@/lib/website-v3/state";
import { pageKey, type DraftPagePayload } from "@/lib/website-v3/types";
import { ColorField, controlClass, InspectorField, PagePickerButton, PagePickerRow, ToggleField } from "./controls";

const targetNames = {
  home: "editorMobileHome", order: "editorMobileOrder", loyalty: "editorMobileLoyalty",
  orders: "editorMobileOrders", catering: "editorMobileCatering", more: "editorMobileMoreShort",
  page: "editorMobileSitePage", url: "editorMobileExternal",
} as const;
const iconNames = {
  home: "editorMobileHome", order: "editorMobileOrder", gift: "editorMobileGiftIcon", drink: "editorMobileDrinkIcon",
  receipt: "editorMobileOrders", bag: "editorMobileCatering", info: "editorMobileSitePage",
  heart: "editorMobileBenefitLoyalty", more: "editorMobileMoreShort", star: "editorMobileBanner", link: "editorMobileExternal",
} as const;

const colorFields = [
  ["background", "editorMobileBackground", "#ffffff"],
  ["border", "editorMobileBorder", "#e1e1e1"],
  ["foreground", "editorMobileForeground", "#1a1a1a"],
  ["icon", "editorMobileIconColor", "#1a1a1a"],
  ["active_background", "editorMobileActiveBackground", "#e8e8e8"],
  ["active_foreground", "editorMobileActiveForeground", "#1a1a1a"],
  ["active_icon", "editorMobileActiveIconColor", "#1a1a1a"],
  ["accent", "editorMobileMotionAccent", "#ffb9cc"],
] as const satisfies ReadonlyArray<readonly [keyof MobileNavigationColors, string, string]>;

function colorFallback(key: keyof MobileNavigationColors, colors: MobileNavigationColors | undefined, fallback: string) {
  const inherited = key === "active_icon" ? colors?.active_foreground || colors?.icon || colors?.foreground
    : key === "icon" || key === "active_foreground" ? colors?.foreground
      : undefined;
  return inherited && /^#[0-9a-f]{6}$/i.test(inherited) ? inherited : fallback;
}

const sectionRows = {
  installation: { label: "editorMobileInstallation", Icon: Download },
  navigation: { label: "editorMobileNavigation", Icon: PanelBottom },
  header: { label: "editorHeader", Icon: PanelTop },
  banner: { label: "editorMainBanner", Icon: Image },
  groups: { label: "editorMobileGroups", Icon: List },
} as const;
type MobileSection = keyof typeof sectionRows;
type CopyScope = "shared" | InstallPlacement;

function move<T>(values: T[], index: number, delta: number): T[] {
  const result = [...values];
  [result[index], result[index + delta]] = [result[index + delta], result[index]];
  return result;
}

function RowActions({ index, length, onMove, onRemove }: {
  index: number;
  length: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="sqe-button" disabled={index === 0} aria-label={t("editorMoveUp")} onClick={() => onMove(-1)}><ArrowUp size={16} /></button>
      <button type="button" className="sqe-button" disabled={index === length - 1} aria-label={t("editorMoveDown")} onClick={() => onMove(1)}><ArrowDown size={16} /></button>
      <button type="button" className="sqe-button" aria-label={t("editorDelete")} onClick={onRemove}><Trash2 size={16} /></button>
    </div>
  );
}

function CopyField({ label, locale, value, onChange, maxLength, placeholder, multiline }: {
  label: string;
  locale: MobileLocale;
  value?: MobileCopy;
  maxLength: number;
  placeholder?: string;
  multiline?: boolean;
  onChange: (copy: MobileCopy) => void;
}) {
  const field = {
    dir: locale === "he" ? "rtl" : "ltr",
    maxLength,
    value: value?.[locale] ?? "",
    placeholder,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({
      ...value, [locale]: event.target.value.replace(/\p{Cc}+/gu, " "),
    }),
  };
  return (
    <InspectorField label={label}>
      {multiline
        ? <textarea {...field} className={`${controlClass} py-2`} rows={2} />
        : <input {...field} className={controlClass} />}
    </InspectorField>
  );
}

/** Edits the shared mobile settings and drives the existing live Website V3 canvas. */
export function MobileExperienceEditor({
  experience, pages, activePage, restaurantName, preview, onPreview, onChange, onClose,
}: {
  experience?: MobileExperience;
  pages: DraftPagePayload[];
  activePage: DraftPagePayload;
  restaurantName: string;
  preview: MobilePreview;
  onPreview: (preview: MobilePreview, page?: string) => void;
  onChange: (experience: MobileExperience) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<MobileSection>();
  const [pagesOpen, setPagesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<CopyScope>("shared");
  const model = experience ?? defaultMobileExperience();
  const { installation, navigation, more } = model;
  const locale = preview.locale;
  const setInstallation = (value: MobileExperience["installation"]) => onChange({ ...model, installation: value });
  const setNavigation = (value: MobileExperience["navigation"]) => onChange({ ...model, navigation: value });
  const setMore = (value: MobileExperience["more"]) => onChange({ ...model, more: value });
  const copy = scope === "shared" ? installation.copy : installation.placement_copy?.[scope];
  const inherited = (field: keyof InstallCopy, label: string) => (
    (scope !== "shared" ? installation.copy[field]?.[locale]?.trim() : undefined) || localizedCopy(locale, label)
  ).replaceAll("{restaurant}", restaurantName);
  const setCopy = (key: keyof InstallCopy, value: MobileCopy) => {
    const next = { ...copy, [key]: value };
    setInstallation(scope === "shared" ? { ...installation, copy: next } : {
      ...installation,
      placement_copy: { ...installation.placement_copy, [scope]: next },
    });
  };
  const updateItem = (id: string, patch: Partial<MobileNavigationItem>) =>
    setNavigation({ ...navigation, items: navigation.items.map(item => item.id === id ? { ...item, ...patch } : item) });
  const barCount = navigation.items.filter(item => item.placement === "bar").length;
  const home = pages.find(page => page.is_homepage);
  const screenTitle = preview.screen === "page" ? activePage.title
    : t(preview.screen === "more" ? "editorMobileMore" : "editorMobileConfirmation");
  const visibleSections: MobileSection[] = preview.screen === "confirmation" ? ["installation"]
    : preview.screen === "more" ? ["header", "banner", "groups", "installation", "navigation"]
      : activePage.is_homepage ? ["installation", "navigation"] : ["navigation"];

  const previewPlacement = (placement: InstallPlacement) => {
    onPreview({
      ...preview,
      mode: "browser",
      screen: placement === "home" ? "page" : placement === "menu" ? "more" : "confirmation",
    }, placement === "home" && home ? pageKey(home) : undefined);
  };

  const choosePage = (screen: MobilePreview["screen"], key?: string) => {
    setPagesOpen(false);
    setSearch("");
    onPreview({
      ...preview,
      screen,
      mode: screen === "more" ? "standalone" : screen === "confirmation" ? "browser" : preview.mode,
    }, key);
  };
  const header = (
    <div className="sqe-panel-top sqe-panel-top--context">
      <h2>{t(section ? sectionRows[section].label : "editorMobileExperience")}</h2>
      <button type="button" className="sqe-button" onClick={section ? () => setSection(undefined) : onClose}>
        {t("editorDone")}
      </button>
    </div>
  );
  const pagePicker = (
    <div className="sqe-page-switch" aria-label={t("editorMobilePreviewScreen")} role="group">
      <PagePickerButton title={screenTitle} expanded={pagesOpen} onClick={() => {
        setPagesOpen(!pagesOpen);
        setSearch("");
      }} />
    </div>
  );

  if (pagesOpen) {
    const matches = (title: string) => title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const sitePages = pages.filter(page => !isTechnicalSitePage(page) && matches(page.title))
      .sort((first, second) => first.sort_order - second.sort_order);
    const systemPages = ([
      ["confirmation", t("editorMobileConfirmation")], ["more", t("editorMobileMore")],
    ] as const).filter(([, title]) => matches(title));
    return (
      <>
        {header}
        {pagePicker}
        <div className="sqe-pages">
          <label className="sqe-search">
            <Search size={18} aria-hidden="true" />
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder={t("editorSearchPages")} aria-label={t("editorSearchPages")} />
          </label>
          {sitePages.length > 0 && <section className="sqe-pages-group">
            <h3>{t("editorMobileSitePages")}</h3>
            {sitePages.map(page => (
              <PagePickerRow key={pageKey(page)} title={page.title} selected={preview.screen === "page" && pageKey(page) === pageKey(activePage)}
                onClick={() => choosePage("page", pageKey(page))} />
            ))}
          </section>}
          {systemPages.length > 0 && <section className="sqe-pages-group">
            <h3>{t("editorMobileExperience")}</h3>
            {systemPages.map(([screen, title]) => (
              <PagePickerRow key={screen} title={title} selected={preview.screen === screen} onClick={() => choosePage(screen)} />
            ))}
          </section>}
          {sitePages.length === 0 && systemPages.length === 0 && <p className="sqe-panel-body">{t("editorNoPages")}</p>}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {!section && <>
        {pagePicker}
        <div className="sqe-outline">
          {visibleSections.map(value => {
            const { label, Icon } = sectionRows[value];
            return (
              <div className="sqe-section-row" key={value}>
                <button type="button" onClick={() => {
                  setSection(value);
                  onPreview({ ...preview, mode: value === "installation" ? "browser" : "standalone" });
                }}>
                  <Icon size={20} aria-hidden="true" />
                  {t(label)}
                </button>
              </div>
            );
          })}
        </div>
      </>}
      <div className="sqe-inspector space-y-5 px-6 pb-6 pt-3">
        <div className="space-y-3 border-b border-slate-200 pb-4">
          <InspectorField label={t("editorMobilePreview")}>
            <select className={controlClass} value={preview.mode} onChange={event => onPreview({ ...preview, mode: event.target.value as MobilePreview["mode"] })}>
              <option value="browser">{t("editorMobileBrowser")}</option>
              <option value="standalone">{t("editorMobileInstalled")}</option>
            </select>
          </InspectorField>
          <InspectorField label={t("editorReceiptLanguage")}>
            <select className={controlClass} value={locale} onChange={event => onPreview({ ...preview, locale: event.target.value as MobileLocale })}>
              <option value="fr">Français</option>
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </InspectorField>
        </div>

        {section === "installation" && <div className="space-y-4">
          {([["home", "editorMobileInstallHome"], ["confirmation", "editorMobileInstallConfirm"], ["menu", "editorMobileInstallMenu"]] as const).map(([placement, label]) => (
            <ToggleField key={placement} fieldId={`mobile.installation.${placement}`} label={t(label)}
              checked={installation[placement]} onChange={enabled => {
                setInstallation({ ...installation, [placement]: enabled });
                previewPlacement(placement);
              }} />
          ))}
          <InspectorField label={t("editorMobileBenefit")}>
            <select className={controlClass} value={installation.benefit} onChange={event => setInstallation({ ...installation, benefit: event.target.value as "menu" | "loyalty" })}>
              <option value="menu">{t("editorMobileBenefitMenu")}</option>
              <option value="loyalty">{t("editorMobileBenefitLoyalty")}</option>
            </select>
          </InspectorField>
          <InspectorField label={t("editorMobileCopyScope")}>
            <select className={controlClass} value={scope} onChange={event => {
              const selected = event.target.value as CopyScope;
              setScope(selected);
              if (selected !== "shared") previewPlacement(selected);
            }}>
              <option value="shared">{t("editorMobileSharedCopy")}</option>
              <option value="home">{t("editorMobileHome")}</option>
              <option value="confirmation">{t("editorMobileConfirmation")}</option>
              <option value="menu">{t("editorMobileMenu")}</option>
            </select>
          </InspectorField>
          <CopyField multiline label={t("editorMobileTitle")} locale={locale} value={copy?.title} onChange={value => setCopy("title", value)} maxLength={100} placeholder={inherited("title", "editorMobileDefaultTitle")} />
          <CopyField multiline label={t("editorMobileSubtitle")} locale={locale} value={copy?.subtitle} onChange={value => setCopy("subtitle", value)} maxLength={220} placeholder={inherited("subtitle", "editorMobileDefaultSubtitle")} />
          <CopyField label={t("editorMobileAction")} locale={locale} value={copy?.action} onChange={value => setCopy("action", value)} maxLength={48} placeholder={inherited("action", "editorMobileDefaultAction")} />
          <p className="text-xs leading-5 text-slate-600">{t("editorMobileInstallHint")}</p>
        </div>}

        {section === "navigation" && <div className="space-y-4">
          <ToggleField fieldId="mobile.navigation.enabled" label={t("editorMobileEnableBar")} checked={navigation.enabled}
            description={t("editorMobileStandaloneOnly")}
            onChange={enabled => setNavigation({ ...navigation, enabled })} />
          <InspectorField label={t("editorMobileBarStyle")}>
            <select className={controlClass} value={navigation.style} onChange={event => setNavigation({ ...navigation, style: event.target.value as "floating" | "docked" })}>
              <option value="floating">{t("editorMobileFloating")}</option>
              <option value="docked">{t("editorMobileDocked")}</option>
            </select>
          </InspectorField>
          <details className="space-y-3 border-b border-slate-200 pb-3">
            <summary className="cursor-pointer text-sm font-semibold">{t("editorMobileColors")}</summary>
            {colorFields.map(([key, label, fallback]) => (
              <ColorField key={key} fieldId={`mobile.navigation.colors.${key}`} label={t(label)}
                value={navigation.colors?.[key] ?? ""} fallback={colorFallback(key, navigation.colors, fallback)}
                onChange={color => {
                  const colors = { ...navigation.colors };
                  if (color) colors[key] = color;
                  else delete colors[key];
                  setNavigation({ ...navigation, colors });
                }} />
            ))}
            <button type="button" className="sqe-button" onClick={() => setNavigation({ ...navigation, colors: undefined })}>{t("editorMobileAutoColor")}</button>
          </details>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("editorMobileLinks")}</h3>
            <p className="text-xs text-slate-600">{t("editorMobileMaxTabs")}</p>
            {navigation.items.map((item, index) => {
              const pageTitle = pages.find(page => page.slug === item.value)?.title;
              const label = item.label?.[locale] || pageTitle || t(targetNames[item.target]);
              const target = item.target === "page" ? "page:" + item.value : item.target;
              return (
                <details key={item.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                    <span className="truncate">{label}</span><ChevronDown size={15} aria-hidden="true" />
                  </summary>
                  <div className="space-y-3 pb-1 pt-2">
                    <CopyField label={t("editorMobileLabel")} locale={locale} value={item.label} maxLength={48} placeholder={label}
                      onChange={value => updateItem(item.id, { label: value })} />
                    <InspectorField label={t("editorMobileTarget")}>
                      <select className={controlClass} value={target} onChange={event => {
                        const next = event.target.value;
                        if (next.startsWith("page:")) updateItem(item.id, { target: "page", value: next.slice(5) });
                        else updateItem(item.id, {
                          target: next as MobileNavigationItem["target"],
                          value: "",
                          ...(next === "more" && item.placement === "more" ? { placement: barCount < 5 ? "bar" : "hidden" } : {}),
                        });
                      }}>
                        {mobileTargets.filter(key => key !== "page").map(key => <option key={key} value={key}>{t(targetNames[key])}</option>)}
                        {item.target === "page" && !pageTitle && <option value={target} disabled>{t("editorMobileMissingPage")}</option>}
                        <optgroup label={t("editorMobileSitePage")}>
                          {pages.map(page => <option key={page.slug} value={"page:" + page.slug}>{page.title}</option>)}
                        </optgroup>
                      </select>
                    </InspectorField>
                    {item.target === "url" && <InspectorField label={t("editorMobileExternalUrl")}>
                      <input className={controlClass} type="url" maxLength={2048} value={item.value ?? ""}
                        onChange={event => updateItem(item.id, { value: event.target.value })} />
                    </InspectorField>}
                    <InspectorField label={t("editorMobileIcon")}>
                      <select className={controlClass} value={item.icon ?? ""} onChange={event => updateItem(item.id, { icon: (event.target.value || undefined) as MobileNavigationItem["icon"] })}>
                        <option value="">—</option>
                        {mobileIcons.map(icon => <option key={icon} value={icon}>{t(iconNames[icon])}</option>)}
                      </select>
                    </InspectorField>
                    <InspectorField label={t("editorMobilePlacement")}>
                      <select className={controlClass} value={item.placement}
                        onChange={event => updateItem(item.id, { placement: event.target.value as MobileNavigationItem["placement"] })}>
                        <option value="bar" disabled={item.placement !== "bar" && barCount >= 5}>{t("editorMobileBar")}</option>
                        {item.target !== "more" && <option value="more">{t("editorMobileMoreShort")}</option>}
                        <option value="hidden">{t("editorMobileHidden")}</option>
                      </select>
                    </InspectorField>
                    {item.placement === "more" && <InspectorField label={t("editorMobileGroup")}>
                      <select className={controlClass} value={item.group ?? ""} onChange={event => updateItem(item.id, { group: event.target.value })}>
                        <option value="">{t("editorMobileNoGroup")}</option>
                        {more.groups.map(group => <option key={group.id} value={group.id}>{group.title[locale] || t("editorMobileGroup")}</option>)}
                      </select>
                    </InspectorField>}
                    <RowActions index={index} length={navigation.items.length}
                      onMove={delta => setNavigation({ ...navigation, items: move(navigation.items, index, delta) })}
                      onRemove={() => setNavigation({ ...navigation, items: navigation.items.filter(entry => entry.id !== item.id) })} />
                  </div>
                </details>
              );
            })}
            <button type="button" className="sqe-button" disabled={navigation.items.length >= 24}
              onClick={() => setNavigation({ ...navigation, items: [...navigation.items, { id: "link-" + crypto.randomUUID(), target: "url", placement: "hidden" }] })}>
              <Plus size={16} />{t("editorMobileAddLink")}
            </button>
          </div>
        </div>}

        {section === "header" && <div className="space-y-4">
          {!navigation.items.some(item => item.target === "more" && item.placement === "bar") &&
            <p className="text-xs leading-5 text-slate-600">{t("editorMobileMoreHint")}</p>}
          <CopyField label={t("editorMobileTitle")} locale={locale} value={more.title} maxLength={56}
            placeholder={t("editorMobileMoreShort")} onChange={title => setMore({ ...more, title })} />
        </div>}
        {section === "banner" && <div className="space-y-4">
          <ToggleField fieldId="mobile.more.banner" label={t("editorMobileBanner")} checked={more.banner?.enabled === true}
            onChange={enabled => setMore({ ...more, banner: { ...more.banner, enabled } })} />
          {more.banner?.enabled && <>
            <CopyField label={t("editorMobileTitle")} locale={locale} value={more.banner.title} maxLength={80}
              onChange={title => setMore({ ...more, banner: { ...more.banner, enabled: true, title } })} />
            <CopyField label={t("editorMobileSubtitle")} locale={locale} value={more.banner.subtitle} maxLength={200}
              onChange={subtitle => setMore({ ...more, banner: { ...more.banner, enabled: true, subtitle } })} />
            <InspectorField label={t("editorMobileImage")}>
              <input className={controlClass} type="url" maxLength={2048} value={more.banner.image_url ?? ""}
                onChange={event => setMore({ ...more, banner: { ...more.banner, enabled: true, image_url: event.target.value } })} />
            </InspectorField>
          </>}
        </div>}
        {section === "groups" && <div className="space-y-3">
          {more.groups.map((group, index) => (
            <div key={group.id} className="space-y-2">
              <CopyField label={t("editorMobileGroup")} locale={locale} value={group.title} maxLength={56}
                onChange={title => setMore({ ...more, groups: more.groups.map(entry => entry.id === group.id ? { ...entry, title } : entry) })} />
              <RowActions index={index} length={more.groups.length}
                onMove={delta => setMore({ ...more, groups: move(more.groups, index, delta) })}
                onRemove={() => onChange({
                  ...model,
                  more: { ...more, groups: more.groups.filter(entry => entry.id !== group.id) },
                  navigation: { ...navigation, items: navigation.items.map(item => item.group === group.id ? { ...item, group: "" } : item) },
                })} />
            </div>
          ))}
          <button type="button" className="sqe-button" disabled={more.groups.length >= 8}
            onClick={() => setMore({ ...more, groups: [...more.groups, { id: "group-" + crypto.randomUUID(), title: {} }] })}>
            <Plus size={16} />{t("editorMobileAddGroup")}
          </button>
        </div>}
      </div>
    </>
  );
}
