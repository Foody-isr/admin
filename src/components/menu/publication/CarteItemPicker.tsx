"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ImageIcon, ListFilter, Plus, Search, X } from "lucide-react";
import { getAllCategories, type CarteDraftGroup, type Menu, type MenuCategory, type MenuItem, type SaleStockOverview } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useDialogReturnFocus } from "@/lib/use-dialog-return-focus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import styles from "./CarteItemPicker.module.css";

type Filters = { categories: number[]; menus: number[]; location: boolean; stock: "all" | "low" | "sold_out" };
type Filter = keyof Filters;
const emptyFilters = (): Filters => ({ categories: [], menus: [], location: false, stock: "all" });
const toggle = (ids: number[], id: number) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];

function Thumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.thumbnail}>{src && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" onError={() => setFailed(true)} />
    : <ImageIcon aria-hidden />}</span>;
}

/** Selects draft group membership independently of restaurant-library filters. */
export function CarteItemPicker({ rid, mid, restaurantName, items, menus, groups, targetKey, chooseTarget, stock, disabled, onTargetChange, onChange, onClose, onCreate }: {
  rid: number; mid: number; restaurantName: string; items: MenuItem[]; menus: Menu[]; groups: CarteDraftGroup[];
  targetKey: string; chooseTarget: boolean; stock: SaleStockOverview | null; disabled: boolean;
  onTargetChange: (key: string) => void; onChange: (key: string, ids: number[]) => void; onClose: () => void; onCreate: () => void;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterFocus = useDialogReturnFocus(filterTrigger);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [categoryError, setCategoryError] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [popover, setPopover] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [pending, setPending] = useState<Filters>(emptyFilters);
  const [filterQuery, setFilterQuery] = useState("");
  useEffect(() => {
    let active = true;
    setCategoryLoading(true);
    setCategoryError(false);
    getAllCategories(rid).then(value => { if (active) setCategories(value); })
      .catch(() => { if (active) setCategoryError(true); })
      .finally(() => { if (active) setCategoryLoading(false); });
    return () => { active = false; };
  }, [rid, retry]);
  const target = groups.find(group => group.key === targetKey);
  const selected = new Set(target?.item_ids ?? []);
  const labels = { categories: t("category"), menus: t("cartePickerMenu"), location: t("pointOfSale"), stock: t("stock") };
  const stockLabels = { all: t("cartePickerAllStock"), low: t("cartePickerLowStock"), sold_out: t("cartePickerSoldOut") };
  const activeCount = Number(filters.categories.length > 0) + Number(filters.menus.length > 0) + Number(filters.location) + Number(filters.stock !== "all");
  const menuItems = new Map(menus.map(menu => [menu.id, new Set(menu.id === mid ? groups.flatMap(group => group.item_ids) : (menu.groups ?? []).flatMap(group => (group.items ?? []).map(item => item.id)))]));
  const visible = items.filter(item => {
    if (!item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
    if (filters.categories.length && !filters.categories.includes(item.category_id)) return false;
    if (filters.menus.length && !filters.menus.some(id => menuItems.get(id)?.has(item.id))) return false;
    if (filters.stock !== "all") {
      const availability = stock?.rows.find(row => row.item.id === item.id)?.availability.availability_state ?? item.availability_state;
      if (filters.stock !== availability) return false;
    }
    return true;
  });
  const openFilter = (value: Filter) => {
    setPending(structuredClone(filters)); setFilterQuery(""); setPopover(false); setFilter(value);
  };
  const summary = (value: Filter) => {
    if (value === "stock") return filters.stock === "all" ? t("all") : stockLabels[filters.stock];
    if (value === "location") return filters.location ? restaurantName : t("all");
    const choices = value === "categories" ? categories : menus;
    return filters[value].length ? choices.filter(choice => filters[value].includes(choice.id)).map(choice => choice.name).join(", ") : t("all");
  };
  const choices = filter === "categories" ? categories.map(category => ({ ...category, count: items.filter(item => item.category_id === category.id).length }))
    : filter === "menus" ? menus.map(menu => ({ ...menu, image_url: "", count: menuItems.get(menu.id)?.size ?? 0 })) : [];
  const filterChanged = filter !== null && JSON.stringify(pending[filter]) !== JSON.stringify(filters[filter]);

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className={styles.overlay} />
      <Dialog.Content {...focus} className={styles.dialog} dir={direction} data-carte-item-picker>
        <div className={styles.actions}><Dialog.Close className={styles.close} aria-label={t("close")}><X aria-hidden /></Dialog.Close><button className={styles.primary} onClick={onClose}>{t("done")}</button></div>
        <Dialog.Title className={styles.title}>{t("cartePickerTitle")}</Dialog.Title>
        <Dialog.Description className="sr-only">{t("carteChooseHint")}</Dialog.Description>
        {chooseTarget && <label className={styles.target}><span>{t("carteTargetGroup")}</span><select aria-label={t("carteTargetGroup")} value={targetKey} disabled={disabled} onChange={event => onTargetChange(event.target.value)}>{groups.map(group => <option key={group.key} value={group.key}>{group.name || t("carteUntitled")}</option>)}</select></label>}
        <div className={styles.searchBar}>
          <label className={styles.search}><Search aria-hidden /><input aria-label={t("search")} placeholder={t("search")} value={query} onChange={event => setQuery(event.target.value)} /></label>
          <Popover open={popover} onOpenChange={setPopover}><PopoverTrigger asChild><button ref={filterTrigger} className={styles.filterButton} aria-label={t("cartePickerFilters")}><ListFilter aria-hidden />{activeCount > 0 && <span>{activeCount}</span>}</button></PopoverTrigger>
            <PopoverContent align="center" sideOffset={8} className={styles.popover} dir={direction} onCloseAutoFocus={event => { if (filter) event.preventDefault(); }}>
              <button className={styles.clearAll} onClick={() => setFilters(emptyFilters())}>{t("cartePickerClearFilters")}</button>
              {(Object.keys(labels) as Filter[]).map(value => <button key={value} className={styles.filterRow} onClick={() => openFilter(value)}><strong>{labels[value]}</strong><span>{summary(value)}</span></button>)}
            </PopoverContent>
          </Popover>
        </div>
        <div className={styles.listHeading}><strong>{t("items")}</strong><span role="status">{t("cartePickerSelected").replace("{n}", String(selected.size))}</span></div>
        <div className={styles.list}>
          <button className={styles.itemRow} onClick={onCreate} disabled={disabled}><span className={styles.thumbnail}><Plus aria-hidden /></span><strong>{t("cartePickerCreate")}</strong></button>
          {visible.map(item => {
            const variants = (item.option_sets ?? []).flatMap(set => set.options ?? []).filter(option => option.is_active).length || (item.variant_groups ?? []).flatMap(group => group.variants).filter(variant => variant.is_active).length;
            return <label className={styles.itemRow} key={item.id} data-picker-item={item.id}><Thumbnail key={item.image_url} src={item.image_url} /><span className={styles.itemText}><strong dir="auto">{item.name}</strong>{variants > 1 && <span>{t("cartePickerVariants").replace("{n}", String(variants))}</span>}</span><input type="checkbox" aria-label={item.name} checked={selected.has(item.id)} disabled={disabled || !target} onChange={event => { if (target) onChange(target.key, event.target.checked ? [...target.item_ids, item.id] : target.item_ids.filter(id => id !== item.id)); }} /></label>;
          })}
          {!visible.length && <p className={styles.empty}>{t("noResults")}</p>}
        </div>
        <Dialog.Root open={filter !== null} onOpenChange={open => { if (!open) setFilter(null); }}>
          <Dialog.Portal><Dialog.Overlay className={`${styles.overlay} ${styles.filterOverlay}`} /><Dialog.Content {...filterFocus} className={`${styles.dialog} ${styles.filterDialog}`} dir={direction} data-carte-picker-filter>
            <div className={styles.actions}><Dialog.Close className={styles.close} aria-label={t("close")}><X aria-hidden /></Dialog.Close><div className={styles.filterActions}><button className={styles.clear} onClick={() => { if (filter) setPending(value => ({ ...value, [filter]: emptyFilters()[filter] })); }}>{t("cartePickerClear")}</button><button className={styles.primary} disabled={!filterChanged} onClick={() => { setFilters(pending); setFilter(null); }}>{t("apply")}</button></div></div>
            <Dialog.Description className={styles.filterBy}>{t("filterBy")}</Dialog.Description><Dialog.Title className={styles.filterTitle}>{filter ? labels[filter] : ""}</Dialog.Title>
            {(filter === "categories" || filter === "menus") && <label className={styles.search}><Search aria-hidden /><input aria-label={filter === "categories" ? t("searchCategories") : t("search")} placeholder={filter === "categories" ? t("searchCategories") : t("search")} value={filterQuery} onChange={event => setFilterQuery(event.target.value)} /></label>}
            <div className={`${styles.list} ${styles.filterList}`}>
              {filter === "categories" && categoryLoading && <p className={styles.empty}>{t("loading")}</p>}
              {filter === "categories" && categoryError && <div role="alert" className={styles.empty}><p>{t("cartePickerCategoriesError")}</p><button className={styles.clear} onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div>}
              {(filter === "categories" || filter === "menus") && (filter !== "categories" || !categoryError) && choices.filter(choice => choice.name.toLocaleLowerCase().includes(filterQuery.trim().toLocaleLowerCase())).map(choice => <label key={choice.id} className={styles.itemRow}><Thumbnail src={choice.image_url} /><span className={styles.itemText}><strong dir="auto">{choice.name}</strong><span>{t("cartePickerItems").replace("{n}", String(choice.count))}</span></span><input type="checkbox" aria-label={choice.name} checked={pending[filter].includes(choice.id)} onChange={() => setPending(value => ({ ...value, [filter]: toggle(value[filter], choice.id) }))} /></label>)}
              {filter === "stock" && !stock && <p className={styles.empty} role="alert">{t("saleStockError")}</p>}
              {filter === "stock" && (Object.keys(stockLabels) as Filters["stock"][]).map(value => <label key={value} className={styles.stockRow}><strong>{stockLabels[value]}</strong><input type="radio" name="carte-picker-stock" value={value} disabled={value !== "all" && !stock} checked={pending.stock === value} onChange={() => setPending(current => ({ ...current, stock: value }))} /></label>)}
              {filter === "location" && <label className={styles.itemRow}><span className={styles.itemText}><strong dir="auto">{restaurantName}</strong></span><input type="checkbox" aria-label={restaurantName} checked={pending.location} onChange={event => setPending(value => ({ ...value, location: event.target.checked }))} /></label>}
              {(filter === "categories" || filter === "menus") && (filter !== "categories" || (!categoryLoading && !categoryError)) && !choices.some(choice => choice.name.toLocaleLowerCase().includes(filterQuery.trim().toLocaleLowerCase())) && <p className={styles.empty}>{t("noResults")}</p>}
            </div>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
