"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Eye,
  History,
  Save,
  ChevronDown,
  Info,
  Monitor,
  MoreHorizontal,
  Plus,
  Store,
} from "lucide-react";
import {
  ApiError,
  getRestaurant,
  listMenus,
  listAllItems,
  getBatchFulfillmentConfig,
  getCarteDraft,
  saveCarteDraft,
  publishCarteDraft,
  discardCarteDraft,
  previewCarteDraft,
  getSalesStock,
  setSalesStockAvailability,
  restockSalesStock,
  type SaleStockLimit,
  type SaleStockRow,
  type CarteDraftState,
  type CarteDocument,
  type CarteDraftGroup,
  type MenuItem,
  type Menu,
  type Restaurant,
  type BatchFulfillmentConfigResponse,
  type SaleStockOverview,
  type AvailabilityOverride,
} from "@/lib/api";
import { useDialogReturnFocus } from "@/lib/use-dialog-return-focus";
import { stockErrors } from "@/lib/carte-editor";
import { useCurrency, useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { Button, ConfirmDialog } from "@/components/ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BatchPicker } from "@/components/menu/BatchPicker";
import ItemUnsavedDialog from "@/components/menu-item/ItemUnsavedDialog";
import { useItemLeaveGuard } from "@/components/menu-item/useItemLeaveGuard";
import { StockPreparation } from "./StockPreparation";
import { StockHistory } from "./StockHistory";
import { CarteGroups } from "./CarteGroups";
import { CarteItemPicker } from "./CarteItemPicker";
import ActionMenu from "@/components/common/ActionMenu";
import styles from "./CarteEditor.module.css";

type Hour = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};
function Hours({
  hours,
  onChange,
  disabled,
}: {
  hours: Hour[];
  onChange: (hours: Hour[]) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-2">
      {Array.from({ length: 7 }, (_, day) => {
        const value = hours.find((h) => h.day_of_week === day) ?? {
          day_of_week: day,
          open_time: "09:00",
          close_time: "22:00",
          is_closed: true,
        };
        const change = (patch: Partial<Hour>) =>
          onChange([
            ...hours.filter((h) => h.day_of_week !== day),
            { ...value, ...patch },
          ]);
        const label = new Intl.DateTimeFormat(locale, {
          weekday: "short",
        }).format(new Date(2024, 0, 7 + day));
        return (
          <div className="flex flex-wrap items-center gap-3 text-sm" key={day}>
            <label className="w-24">
              <input
                type="checkbox"
                disabled={disabled}
                checked={!value.is_closed}
                onChange={(e) => change({ is_closed: !e.target.checked })}
              />{" "}
              {label}
            </label>
            {!value.is_closed && (
              <>
                <input
                  className="input w-32"
                  type="time"
                  aria-label={`${label} ${t("saleStockOpen")}`}
                  disabled={disabled}
                  value={value.open_time}
                  onChange={(e) => change({ open_time: e.target.value })}
                />
                <span>—</span>
                <input
                  className="input w-32"
                  type="time"
                  aria-label={`${label} ${t("saleStockClose")}`}
                  disabled={disabled}
                  value={value.close_time}
                  onChange={(e) => change({ close_time: e.target.value })}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
const blankGroup = (): CarteDraftGroup => ({
  key: crypto.randomUUID(),
  id: 0,
  name: "",
  image_url: "",
  pos_enabled: true,
  web_enabled: true,
  is_hidden: false,
  follows_menu_hours: true,
  hours: [],
  banner_focal_x: 50,
  banner_focal_y: 50,
  item_ids: [],
});
export default function CarteEditorPage() {
  const { restaurantId, menuId, groupId } = useParams();
  const pathname = usePathname();
  return (
    <CarteEditor
      key={`${restaurantId}.${menuId}`}
      rid={Number(restaurantId)}
      mid={Number(menuId)}
      initialGroup={typeof groupId === "string" ? groupId : undefined}
      initialSettings={pathname.endsWith("/edit")}
    />
  );
}
function CarteEditor({
  rid,
  mid,
  initialGroup,
  initialSettings,
}: {
  rid: number;
  mid: number;
  initialGroup?: string;
  initialSettings?: boolean;
}) {
  const { t, locale } = useI18n();
  const dialogFocus = useDialogReturnFocus();
  const router = useRouter();
  const { money } = useCurrency();
  const translation = useRef(t);
  translation.current = t;
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission("menu.edit");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [batch, setBatch] = useState<BatchFulfillmentConfigResponse | null>(
    null,
  );
  const [index, setIndex] = useState(0);
  const [date, setDate] = useState<string | null>(null);
  const [state, setState] = useState<CarteDraftState | null>(null);
  const [doc, setDoc] = useState<CarteDocument | null>(null);
  const [stock, setStock] = useState<SaleStockOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"settings" | "stock" | "preview" | null>(
    initialSettings ? "settings" : null,
  );
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [choosePickerTarget, setChoosePickerTarget] = useState(false);
  const [preview, setPreview] = useState<Menu | null>(null);
  const [historyItem, setHistoryItem] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<
    "publish" | "discard" | null
  >(null);
  const [removeGroup, setRemoveGroup] = useState<string | null>(null);
  const initialOpened = useRef(false);
  useEffect(() => {
    if (!doc || initialOpened.current || !initialGroup) return;
    initialOpened.current = true;
    if (initialGroup === "new" && canEdit) {
      const created = blankGroup();
      setDoc((prev) =>
        prev ? { ...prev, groups: [...prev.groups, created] } : prev,
      );
      setGroupKey(created.key);
    } else {
      setGroupKey(
        doc.groups.find((g) => g.id === Number(initialGroup))?.key ?? null,
      );
    }
  }, [doc, initialGroup, canEdit]);
  const dirty =
    !!doc && !!state && JSON.stringify(doc) !== JSON.stringify(state.payload);
  const guard = useItemLeaveGuard(
    () => dirty,
    () => lock.current,
  );
  const accept = useCallback((value: CarteDraftState) => {
    setState(value);
    setDoc(value.payload);
  }, []);
  const fail = (error?: unknown) => setError(t(error instanceof ApiError && error.message === "stock_conversion_unavailable" ? "itemStockConversionError" : "carteConflict"));
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listMenus(rid),
      listAllItems(rid),
      getBatchFulfillmentConfig(rid),
      getRestaurant(rid),
    ])
      .then(([menus, library, config, restaurant]) => {
        if (!active) return;
        const found = menus.find((m) => m.id === mid);
        if (!found) throw new Error();
        setMenu(found);
        setMenus(menus);
        setRestaurant(restaurant);
        setItems(library);
        setBatch(config);
        const key = found.is_weekly_rotating
          ? config.upcoming_cycles?.[0]?.fulfillment_days?.[0]?.date
          : null;
        if (found.is_weekly_rotating && !key) {
          setError(translation.current("carteBatchRequired"));
          setLoading(false);
          return;
        }
        setDate(key ?? "");
      })
      .catch(() => {
        if (active) {
          setError(translation.current("saleStockError"));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [rid, mid]);
  useEffect(() => {
    if (date === null) return;
    let active = true;
    setLoading(true);
    setError("");
    setState(null);
    setDoc(null);
    Promise.all([getCarteDraft(rid, mid, date), getSalesStock(rid, date)])
      .then(([draft, overview]) => {
        if (active) {
          accept(draft);
          setStock(overview);
        }
      })
      .catch(() => {
        if (active) setError(translation.current("saleStockError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rid, mid, date, accept]);
  const edit = (patch: Partial<CarteDocument>) => {
    if (canEdit && !lock.current)
      setDoc((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const group = doc?.groups.find((g) => g.key === groupKey);
  const updateGroup = (key: string, patch: Partial<CarteDraftGroup>) => {
    if (doc)
      edit({
        groups: doc.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)),
      });
  };
  const invalidStock = !!doc?.stocks?.some((limit) => {
    const row = stock?.rows.find((r) => r.item.id === limit.menu_item_id);
    return !row || stockErrors(limit, row);
  });
  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (error) {
      fail(error);
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  async function save() {
    if (!doc || !state || date === null || !canEdit) return false;
    const saved = await run(() =>
      saveCarteDraft(rid, mid, date, {
        revision: state.revision,
        base_revision: state.base_revision,
        base_fingerprint: state.base_fingerprint,
        payload: doc,
      }),
    );
    if (saved) {
      accept(saved);
      return true;
    }
    return false;
  }
  async function publish() {
    if (!doc || !state || date === null || !canEdit || invalidStock) return;
    await run(async () => {
      const saved = dirty
        ? await saveCarteDraft(rid, mid, date, {
            revision: state.revision,
            base_revision: state.base_revision,
            base_fingerprint: state.base_fingerprint,
            payload: doc,
          })
        : state;
      accept(saved);
      const published = await publishCarteDraft(rid, mid, date, saved.revision);
      accept(published);
      setStock(await getSalesStock(rid, date));
    });
  }
  async function discard() {
    if (!state || date === null || !canEdit) return;
    await run(async () => {
      if (state.has_draft)
        accept(await discardCarteDraft(rid, mid, date, state.revision));
      else setDoc(state.payload);
    });
  }
  async function openStock() {
    if (date === null) return;
    const latest = await run(() => getSalesStock(rid, date));
    if (latest) {
      setStock(latest);
      setPanel("stock");
    }
  }
  async function showPreview() {
    if (!doc || date === null) return;
    const result = await run(() => previewCarteDraft(rid, mid, date, doc));
    if (result) {
      setPreview(result.menu);
      setPanel("preview");
    }
  }
  async function operational(id: number, value: AvailabilityOverride, remaining?: SaleStockLimit) {
    if (date === null || !canEdit) return;
    const applied = await run(async () => {
      if (remaining) await restockSalesStock(rid, date || stock?.series_key || "", remaining);
      else await setSalesStockAvailability(
        rid,
        date || stock?.series_key || "",
        id,
        value,
      );
      const latest = await getSalesStock(rid, date);
      setStock(latest);
      const cfg = latest.rows.find((r) => r.item.id === id)?.config;
      if (cfg) {
        setDoc((prev) =>
          prev
            ? {
                ...prev,
                stocks: (prev.stocks ?? []).filter((s) => !remaining || s.menu_item_id !== id).map((s) =>
                  s.menu_item_id === id
                    ? {
                        ...s,
                        override: cfg.override,
                        expected_revision: cfg.revision,
                      }
                    : s,
                ),
              }
            : prev,
        );
        setState((prev) =>
          prev
            ? {
                ...prev,
                payload: {
                  ...prev.payload,
                  stocks: (prev.payload.stocks ?? []).filter((s) => !remaining || s.menu_item_id !== id).map((s) =>
                    s.menu_item_id === id
                      ? {
                          ...s,
                          override: cfg.override,
                          expected_revision: cfg.revision,
                        }
                      : s,
                  ),
                },
              }
            : prev,
        );
      }
      return true;
    });
    return applied === true;
  }
  const goSeries = (next: number) =>
    guard.requestAction(() => {
      setIndex(next);
      setDate(batch?.upcoming_cycles[next]?.fulfillment_days?.[0]?.date ?? "");
      setPanel(null);
      setGroupKey(null);
      setPicker(null);
    });
  function addGroup() {
    if (!doc || !canEdit) return;
    const value = blankGroup();
    edit({ groups: [...doc.groups, value] });
    setGroupKey(value.key);
  }
  const hasChanges = dirty || !!state?.has_draft;
  const statusText = busy
    ? t("saving")
    : dirty
      ? t("carteUnsaved")
      : state?.has_draft
        ? t("carteSaved")
        : state?.published_revision
          ? t("cartePublished")
          : t("carteLiveStatus");
  const navigate = (path: string) =>
    guard.requestAction(() => router.push(path));
  return (
    <div className={styles.page}>
      <header className={styles.header} data-carte-editor-header>
        <div className={styles.heading}>
          <Link
            className={styles.back}
            href={`/${rid}/menu/menus`}
            aria-label={t("carteBack")}
          >
            <ArrowLeft aria-hidden />
          </Link>
          <div className={styles.headingBody}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>
                {doc?.name || menu?.name || t("menus")}
              </h1>
              <ActionMenu
                label={t("carteMenuActions")}
                iconOnly
                className={styles.menuTrigger}
                actions={[
                  {
                    label: t("carteSettings"),
                    disabled: !doc || busy,
                    onClick: () => setPanel("settings"),
                  },
                  {
                    label: t("cartePreview"),
                    disabled: !doc || busy,
                    onClick: () => void showPreview(),
                  },
                  ...(menu?.is_weekly_rotating
                    ? [
                        {
                          label: t("saleStockPrepare"),
                          disabled: !doc || busy,
                          onClick: () => void openStock(),
                        },
                      ]
                    : []),
                  {
                    label: t("saleStockTitle"),
                    disabled: busy,
                    onClick: () => navigate(`/${rid}/menu/stock`),
                  },
                  {
                    label: t("carteDiscardDraft"),
                    variant: "danger",
                    disabled: !canEdit || busy || !hasChanges,
                    onClick: () => setConfirmation("discard"),
                  },
                ]}
              >
                <MoreHorizontal aria-hidden />
              </ActionMenu>
              <span
                className={styles.status}
                data-dirty={dirty}
                role="status"
                title={
                  state?.updated_at
                    ? `${t("carteSavedAt")} ${new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(state.updated_at))}`
                    : undefined
                }
              >
                {statusText}
              </span>
            </div>
            <div className={styles.metadata}>
              {restaurant && (
                <>
                  <span className={styles.metadataPart}>
                    <Store aria-hidden />
                    <span>{restaurant.name}</span>
                  </span>
                  <span className={styles.metadataDivider} aria-hidden />
                </>
              )}
              <span className={styles.metadataPart}>
                <Monitor aria-hidden />
                <span>
                  {doc?.pos_enabled && doc?.web_enabled
                    ? t("cartePosAndWeb")
                    : doc?.pos_enabled
                      ? t("cartePosChannel")
                      : doc?.web_enabled
                        ? t("carteWebChannel")
                        : t("carteHidden")}
                </span>
              </span>
              {menu?.is_weekly_rotating && batch && (
                <>
                  <span className={styles.metadataDivider} aria-hidden />
                  <BatchPicker
                    compact
                    cycles={batch.upcoming_cycles}
                    selectedIndex={index}
                    onChange={goSeries}
                  />
                </>
              )}
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            disabled={!doc || busy}
            onClick={() => void showPreview()}
          >
            <Eye aria-hidden />
            {t("cartePreview")}
          </Button>
          <Button
            variant="secondary"
            disabled={!canEdit || busy || !dirty}
            onClick={save}
          >
            <Save aria-hidden />
            {t("carteSaveDraft")}
          </Button>
          <Button
            disabled={!canEdit || busy || invalidStock || !hasChanges}
            onClick={() => setConfirmation("publish")}
          >
            {t("cartePublish")}
          </Button>
        </div>
      </header>
      <div className={styles.operations} data-carte-editor-operations>
        <div className={styles.operationActions}>
          {menu?.is_weekly_rotating && (
            <Button
              variant="secondary"
              disabled={!doc || busy}
              onClick={() => void openStock()}
            >
              <Boxes aria-hidden />
              <span>{t("saleStockPrepare")}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => navigate(`/${rid}/menu/stock`)}
          >
            <History aria-hidden />
            <span>{t("saleStockTitle")}</span>
          </Button>
          <Button
            variant="ghost"
            disabled={!doc || busy || !canEdit}
            title={t("editPosLayout")}
            aria-label={t("editPosLayout")}
            onClick={() => navigate(`/${rid}/menu/menus/${mid}/pos-display`)}
          >
            <Monitor aria-hidden />
            <span>{t("cartePosLayoutShort")}</span>
          </Button>
        </div>
        <ActionMenu
          label={t("add")}
          className={styles.addButton}
          actions={[
            {
              label: t("carteAddItems"),
              disabled: !canEdit || busy || !doc?.groups.length,
              onClick: () => {
                if (doc?.groups[0]) {
                  setPicker(doc.groups[0].key);
                  setChoosePickerTarget(true);
                }
              },
            },
            {
              label: t("carteAddGroup"),
              disabled: !canEdit || busy || !doc,
              onClick: addGroup,
            },
          ]}
        >
          <span>{t("add")}</span>
          <ChevronDown aria-hidden />
        </ActionMenu>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <p className="mt-1 text-sm">{t("carteConflictHint")}</p>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              guard.requestAction(() => {
                if (date !== null)
                  getCarteDraft(rid, mid, date).then(accept).catch(fail);
              })
            }
          >
            {t("carteReload")}
          </Button>
        </div>
      )}
      {loading && (
        <p className="py-12" role="status">
          {t("loading")}
        </p>
      )}
      {doc && !loading && (
        <>
          <CarteGroups
            key={date}
            rid={rid}
            mid={mid}
            doc={doc}
            items={items}
            stock={stock}
            series={!!batch?.enabled}
            restaurantName={restaurant?.name ?? ""}
            canEdit={canEdit}
            busy={busy}
            onEdit={edit}
            onGroupSettings={setGroupKey}
            onChooseItems={(key) => {
              setPicker(key);
              setChoosePickerTarget(false);
            }}
            onRemoveGroup={setRemoveGroup}
            onHistory={setHistoryItem}
            availabilityError={error}
            onAvailabilityOpen={() => setError("")}
            onReloadStock={() => run(async () => { if (date !== null) setStock(await getSalesStock(rid, date)); })}
            onAvailabilityApply={operational}
            onEditItem={(id) =>
              navigate(
                `/${rid}/menu/items/${id}?from=${encodeURIComponent(`/${rid}/menu/menus/${mid}`)}`,
              )
            }
          />
          {canEdit && (
            <button
              type="button"
              className={styles.addGroup}
              disabled={busy}
              onClick={addGroup}
            >
              <Plus aria-hidden />
              <span>{t("carteAddGroupCard")}</span>
            </button>
          )}
          {doc.groups.length === 0 && (
            <p className={styles.libraryHint}>{t("carteEmpty")}</p>
          )}
          <p className={styles.libraryHint}>{t("carteSharedLibraryHint")}</p>
        </>
      )}
      {hasChanges && doc && (
        <div className={styles.publishBar} data-carte-editor-footer>
          <div className={styles.publishBarText}>
            <strong>{statusText}</strong>
            <span>{t("carteDraftHint")}</span>
          </div>
          <div className={styles.publishActions}>
            <Button
              variant="secondary"
              disabled={!canEdit || busy || !dirty}
              onClick={save}
            >
              {t("carteSaveDraft")}
            </Button>
            <Button
              disabled={!canEdit || busy || invalidStock}
              onClick={() => setConfirmation("publish")}
            >
              {t("cartePublish")}
            </Button>
          </div>
        </div>
      )}
      {!hasChanges && (
        <a
          className={styles.helpLink}
          href={`https://foody-pos.co.il/${locale}/help/menu/menus-and-groups`}
          target="_blank"
          rel="noreferrer"
        >
          <Info aria-hidden />
          {t("carteHelp")}
        </a>
      )}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPanel(null);
        }}
      >
        <DialogContent {...dialogFocus} className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {panel === "settings"
                ? t("carteSettings")
                : panel === "stock"
                  ? t("saleStockPrepare")
                  : t("cartePrivatePreview")}
            </DialogTitle>
            <DialogDescription>
              {panel === "preview"
                ? t("cartePreviewHint")
                : t("carteLocalChangesHint")}
            </DialogDescription>
          </DialogHeader>
          {panel === "settings" && doc && (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span>{t("name")}</span>
                <input
                  className="input"
                  value={doc.name}
                  disabled={!canEdit || busy}
                  maxLength={250}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span>{t("description")}</span>
                <textarea
                  className="input"
                  value={doc.description}
                  disabled={!canEdit || busy}
                  maxLength={5000}
                  onChange={(e) => edit({ description: e.target.value })}
                />
              </label>
              {(
                [
                  "web_enabled",
                  "pos_enabled",
                  "follows_restaurant_hours",
                ] as const
              ).map((key) => (
                <label className="flex gap-2 items-center" key={key}>
                  <input
                    type="checkbox"
                    checked={doc[key]}
                    disabled={!canEdit || busy}
                    onChange={(e) => edit({ [key]: e.target.checked })}
                  />
                  {t(`carte_${key}`)}
                </label>
              ))}
              {!doc.follows_restaurant_hours && (
                <Hours
                  hours={doc.hours ?? []}
                  disabled={!canEdit || busy}
                  onChange={(hours) =>
                    edit({ hours: hours as CarteDocument["hours"] })
                  }
                />
              )}
            </div>
          )}
          {panel === "stock" && doc && stock && (
            <StockPreparation
              rows={stock.rows}
              limits={doc.stocks ?? []}
              onChange={(stocks) => edit({ stocks })}
              disabled={!canEdit || busy}
            />
          )}
          {panel === "preview" && preview && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">{preview.name}</h2>
              {preview.groups
                ?.filter((g) => g.web_enabled && !g.is_hidden)
                .map((g, i) => (
                  <section key={`${g.id}.${i}`}>
                    <h3 className="text-xl mb-3 font-semibold">{g.name}</h3>
                    <div className="divide-y">
                      {g.items?.map((item) => (
                        <div
                          className="py-3 flex justify-between gap-4"
                          key={item.id}
                        >
                          <span>{item.name}</span>
                          <span>{money(item.price)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              {doc?.stocks?.length ? (
                <p className="text-sm">{t("cartePreviewStocksHint")}</p>
              ) : null}
            </div>
          )}
          <Button variant="secondary" onClick={() => setPanel(null)}>
            {t("close")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!group}
        onOpenChange={(open) => {
          if (!open) setGroupKey(null);
        }}
      >
        <DialogContent {...dialogFocus}>
          <DialogHeader>
            <DialogTitle>{t("carteGroupSettings")}</DialogTitle>
            <DialogDescription>{t("carteLocalChangesHint")}</DialogDescription>
          </DialogHeader>
          {group && (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span>{t("name")}</span>
                <input
                  className="input"
                  maxLength={250}
                  value={group.name}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    updateGroup(group.key, { name: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span>{t("carteGroupImage")}</span>
                <input
                  className="input"
                  type="url"
                  value={group.image_url}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    updateGroup(group.key, { image_url: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span>{t("carteParentGroup")}</span>
                <select
                  className="input"
                  value={group.parent_key ?? ""}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    updateGroup(group.key, { parent_key: e.target.value })
                  }
                >
                  <option value="">{t("none")}</option>
                  {doc?.groups
                    .filter((v) => v.key !== group.key)
                    .map((v) => (
                      <option value={v.key} key={v.key}>
                        {v.name || t("carteUntitled")}
                      </option>
                    ))}
                </select>
              </label>
              {(
                [
                  "web_enabled",
                  "pos_enabled",
                  "is_hidden",
                  "follows_menu_hours",
                ] as const
              ).map((key) => (
                <label className="flex items-center gap-2" key={key}>
                  <input
                    type="checkbox"
                    checked={group[key]}
                    disabled={!canEdit || busy}
                    onChange={(e) =>
                      updateGroup(group.key, { [key]: e.target.checked })
                    }
                  />
                  {t(`carte_${key}`)}
                </label>
              ))}
              {!group.follows_menu_hours && (
                <Hours
                  hours={group.hours ?? []}
                  disabled={!canEdit || busy}
                  onChange={(hours) =>
                    updateGroup(group.key, {
                      hours: hours as CarteDraftGroup["hours"],
                    })
                  }
                />
              )}
              <Button variant="secondary" onClick={() => setGroupKey(null)}>
                {t("close")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {picker !== null && doc && (
        <CarteItemPicker
          rid={rid}
          restaurantName={restaurant?.name ?? ""}
          items={items}
          menus={menus}
          mid={mid}
          groups={doc.groups}
          targetKey={picker}
          chooseTarget={choosePickerTarget}
          stock={stock}
          disabled={!canEdit || busy}
          onTargetChange={setPicker}
          onChange={(key, item_ids) => updateGroup(key, { item_ids })}
          onClose={() => setPicker(null)}
          onCreate={() => { setPicker(null); navigate(`/${rid}/menu/items/new?returnTo=${encodeURIComponent(`/${rid}/menu/menus/${mid}`)}`); }}
        />
      )}
      <Dialog
        open={historyItem !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryItem(null);
        }}
      >
        <DialogContent {...dialogFocus} className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("saleStockHistory")}</DialogTitle>
            <DialogDescription>{t("saleStockHistoryHint")}</DialogDescription>
          </DialogHeader>
          {historyItem !== null && (
            <StockHistory rid={rid} itemId={historyItem} />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removeGroup !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveGroup(null);
        }}
        title={t("carteDeleteGroupTitle")}
        description={t("carteDeleteGroupHint")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        danger
        onConfirm={() => {
          if (doc && removeGroup && canEdit && !busy)
            edit({
              groups: doc.groups
                .filter((value) => value.key !== removeGroup)
                .map((value) =>
                  value.parent_key === removeGroup
                    ? { ...value, parent_key: "" }
                    : value,
                ),
            });
          setRemoveGroup(null);
        }}
      />
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation === "publish"
            ? t("cartePublishTitle")
            : t("carteDiscardTitle")
        }
        description={
          confirmation === "publish"
            ? t("cartePublishReview")
                .replace("{groups}", String(doc?.groups.length ?? 0))
                .replace("{stocks}", String(doc?.stocks?.length ?? 0))
            : t("carteDiscardHint")
        }
        confirmLabel={
          confirmation === "publish"
            ? t("cartePublish")
            : t("carteDiscardDraft")
        }
        cancelLabel={t("cancel")}
        danger={confirmation === "discard"}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action === "publish") void publish();
          else void discard();
        }}
      />
      <ItemUnsavedDialog
        open={guard.open}
        onCancel={guard.cancel}
        onDiscard={() => {
          setDoc(state?.payload ?? null);
          guard.finish(`/${rid}/menu/menus`);
        }}
        onSave={async () => {
          if (await save()) guard.finish(`/${rid}/menu/menus`);
        }}
        saving={busy}
        saveDisabled={!canEdit}
        error={error}
        title={t("carteUnsavedTitle")}
        description={t("carteUnsavedHint")}
        saveLabel={t("carteSaveAndLeave")}
      />
    </div>
  );
}
