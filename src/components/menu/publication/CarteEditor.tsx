"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from "lucide-react";
import {
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
  type CarteDraftState,
  type CarteDocument,
  type CarteDraftGroup,
  type MenuItem,
  type Menu,
  type BatchFulfillmentConfigResponse,
  type SaleStockOverview,
  type AvailabilityOverride,
} from "@/lib/api";
import { moveEntry, stockErrors } from "@/lib/carte-editor";
import { useCurrency, useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { PageHead, Button, ConfirmDialog } from "@/components/ds";
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
  const { money } = useCurrency();
  const translation = useRef(t);
  translation.current = t;
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission("menu.edit");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
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
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Menu | null>(null);
  const [historyItem, setHistoryItem] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<
    "publish" | "discard" | null
  >(null);
  const [selected, setSelected] = useState<{
    group: string;
    ids: number[];
  } | null>(null);
  const [drag, setDrag] = useState<{ group: string; id?: number } | null>(null);
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
  const fail = () => setError(t("carteConflict"));
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listMenus(rid),
      listAllItems(rid),
      getBatchFulfillmentConfig(rid),
    ])
      .then(([menus, library, config]) => {
        if (!active) return;
        const found = menus.find((m) => m.id === mid);
        if (!found) throw new Error();
        setMenu(found);
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
    setSelected(null);
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
    } catch {
      fail();
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
  async function operational(id: number, value: AvailabilityOverride) {
    if (date === null || !canEdit) return;
    await run(async () => {
      await setSalesStockAvailability(
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
                stocks: (prev.stocks ?? []).map((s) =>
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
                  stocks: (prev.payload.stocks ?? []).map((s) =>
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
    });
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
  const library = new Map(items.map((item) => [item.id, item]));
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Link className="text-sm underline" href={`/${rid}/menu/menus`}>
        ← {t("menus")}
      </Link>
      <PageHead
        title={doc?.name || menu?.name || t("menus")}
        desc={t("carteDraftHint")}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy || !doc}
              onClick={showPreview}
            >
              {t("cartePreview")}
            </Button>
            <Button
              variant="secondary"
              disabled={!canEdit || busy || !dirty}
              onClick={save}
            >
              {t("carteSaveDraft")}
            </Button>
            <Button
              disabled={
                !canEdit ||
                busy ||
                !doc ||
                (!dirty && !state?.has_draft) ||
                invalidStock
              }
              onClick={() => setConfirmation("publish")}
            >
              {t("cartePublish")}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {menu?.is_weekly_rotating && batch && (
            <BatchPicker
              cycles={batch.upcoming_cycles}
              selectedIndex={index}
              onChange={goSeries}
            />
          )}
          <span
            className={`rounded-full px-3 py-1 text-sm ${dirty ? "bg-amber-50 text-amber-900" : "bg-[var(--surface-2)]"}`}
            role="status"
          >
            {busy
              ? t("saving")
              : dirty
                ? t("carteUnsaved")
                : state?.has_draft
                  ? t("carteSaved")
                  : state?.published_revision
                    ? t("cartePublished")
                    : t("carteLiveLegacy")}
          </span>
          {state?.updated_at && (
            <span className="text-xs text-[var(--fg-muted)]">
              {t("carteSavedAt")}{" "}
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(state.updated_at))}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={!doc || busy}
            onClick={() => setPanel("settings")}
          >
            <Settings2 />
            {t("carteSettings")}
          </Button>
          {menu?.is_weekly_rotating && (
            <Button
              variant="secondary"
              disabled={!doc || busy}
              onClick={openStock}
            >
              {t("saleStockPrepare")}
            </Button>
          )}
          <Link
            className="text-sm underline self-center"
            href={`/${rid}/menu/stock`}
          >
            {t("saleStockTitle")}
          </Link>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="border border-red-300 rounded-lg p-4 text-red-700 space-y-2"
        >
          <p>{error}</p>
          <p className="text-sm">{t("carteConflictHint")}</p>
          <Button
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
      {loading && <p role="status">{t("loading")}</p>}
      {doc && !loading && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h2 className="text-lg font-semibold">{t("carteGroups")}</h2>
            <Button
              variant="secondary"
              disabled={!canEdit || busy}
              onClick={addGroup}
            >
              <Plus />
              {t("carteAddGroup")}
            </Button>
          </div>
          {doc.groups.length === 0 && (
            <div className="border rounded-lg p-12 text-center text-[var(--fg-muted)]">
              {t("carteEmpty")}
            </div>
          )}
          <div className="space-y-6">
            {doc.groups.map((g, gi) => (
              <section
                key={g.key}
                className="border rounded-lg overflow-hidden"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!drag || busy || !canEdit) return;
                  if (drag.id === undefined && drag.group !== g.key) {
                    const source = doc.groups.findIndex(
                      (v) => v.key === drag.group,
                    );
                    const next = [...doc.groups];
                    const [moved] = next.splice(source, 1);
                    next.splice(gi, 0, moved);
                    edit({ groups: next });
                  }
                  setDrag(null);
                }}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--surface-2)]">
                  <button
                    className="font-semibold text-start min-h-11"
                    draggable={canEdit && !busy}
                    onDragStart={() => setDrag({ group: g.key })}
                    onClick={() => setGroupKey(g.key)}
                  >
                    {g.name || t("carteUntitled")}{" "}
                    <span className="font-normal text-[var(--fg-muted)]">
                      ({g.item_ids.length})
                    </span>
                    {g.is_hidden && (
                      <span className="ms-2 text-xs">{t("carteHidden")}</span>
                    )}
                  </button>
                  <div className="flex flex-wrap gap-1 items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEdit || busy || gi === 0}
                      aria-label={t("carteMoveUp")}
                      onClick={() =>
                        edit({ groups: moveEntry(doc.groups, gi, -1) })
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        !canEdit || busy || gi === doc.groups.length - 1
                      }
                      aria-label={t("carteMoveDown")}
                      onClick={() =>
                        edit({ groups: moveEntry(doc.groups, gi, 1) })
                      }
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canEdit || busy}
                      onClick={() => {
                        setPicker(g.key);
                        setSearch("");
                      }}
                    >
                      {t("carteChooseItems")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEdit || busy}
                      aria-label={t("delete")}
                      onClick={() => {
                        edit({
                          groups: doc.groups
                            .filter((v) => v.key !== g.key)
                            .map((v) =>
                              v.parent_key === g.key
                                ? { ...v, parent_key: "" }
                                : v,
                            ),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </header>
                {selected?.group === g.key && selected.ids.length > 0 && (
                  <div className="p-3 border-b flex flex-wrap gap-3 items-center text-sm">
                    <span>
                      {selected.ids.length} {t("carteSelected")}
                    </span>
                    <select
                      className="input w-auto"
                      aria-label={t("carteMoveTo")}
                      value=""
                      disabled={busy || !canEdit}
                      onChange={(e) => {
                        const target = e.target.value;
                        if (!target) return;
                        edit({
                          groups: doc.groups.map((v) =>
                            v.key === g.key
                              ? {
                                  ...v,
                                  item_ids: v.item_ids.filter(
                                    (id) => !selected.ids.includes(id),
                                  ),
                                }
                              : v.key === target
                                ? {
                                    ...v,
                                    item_ids: [
                                      ...v.item_ids,
                                      ...selected.ids.filter(
                                        (id) => !v.item_ids.includes(id),
                                      ),
                                    ],
                                  }
                                : v,
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      <option value="">{t("carteMoveTo")}</option>
                      {doc.groups
                        .filter((v) => v.key !== g.key)
                        .map((v) => (
                          <option value={v.key} key={v.key}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !canEdit}
                      onClick={() => {
                        updateGroup(g.key, {
                          item_ids: g.item_ids.filter(
                            (id) => !selected.ids.includes(id),
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      {t("carteRemoveSelected")}
                    </Button>
                  </div>
                )}
                <div className="divide-y">
                  {g.item_ids.map((id, i) => {
                    const item = library.get(id);
                    const status = stock?.rows.find((r) => r.item.id === id);
                    const override =
                      status?.config?.override ??
                      (status?.managed
                        ? "auto"
                        : (item?.availability_override ?? "auto"));
                    return (
                      <div
                        key={id}
                        className="p-3 sm:px-4 flex flex-wrap sm:flex-nowrap items-center gap-3 min-h-16"
                        draggable={canEdit && !busy}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDrag({ group: g.key, id });
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          if (drag?.group !== g.key || drag.id === undefined)
                            return;
                          e.preventDefault();
                          e.stopPropagation();
                          const next = [...g.item_ids];
                          const source = next.indexOf(drag.id);
                          next.splice(source, 1);
                          next.splice(i, 0, drag.id);
                          updateGroup(g.key, { item_ids: next });
                          setDrag(null);
                        }}
                      >
                        <input
                          type="checkbox"
                          className="size-4"
                          disabled={!canEdit || busy}
                          aria-label={`${t("select")} ${item?.name || id}`}
                          checked={
                            selected?.group === g.key &&
                            selected.ids.includes(id)
                          }
                          onChange={(e) =>
                            setSelected({
                              group: g.key,
                              ids: e.target.checked
                                ? [
                                    ...(selected?.group === g.key
                                      ? selected.ids
                                      : []),
                                    id,
                                  ]
                                : (selected?.ids ?? []).filter(
                                    (value) => value !== id,
                                  ),
                            })
                          }
                        />
                        <div className="flex-1 min-w-[140px]">
                          <Link
                            className="font-medium hover:underline"
                            href={`/${rid}/menu/items/${id}`}
                          >
                            {item?.name || `#${id}`}
                          </Link>
                          <div className="text-sm text-[var(--fg-muted)]">
                            {item ? money(item.price) : "—"} ·{" "}
                            {status?.availability.buildable_count ?? "∞"}{" "}
                            {t("saleStockAvailable").toLocaleLowerCase()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryItem(id)}
                        >
                          {t("saleStockHistory")}
                        </Button>
                        {stock?.series_key && (
                          <select
                            className="input w-auto max-w-44 text-sm"
                            aria-label={`${t("carteImmediateAvailability")} — ${item?.name || id}`}
                            disabled={!canEdit || busy}
                            value={override}
                            onChange={(e) =>
                              operational(
                                id,
                                e.target.value as AvailabilityOverride,
                              )
                            }
                          >
                            {(
                              [
                                "auto",
                                "force_available",
                                "force_sold_out",
                              ] as const
                            ).map((value) => (
                              <option key={value} value={value}>
                                {t(`saleStockOverride_${value}`)}
                              </option>
                            ))}
                          </select>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("carteMoveUp")}
                          disabled={!canEdit || busy || i === 0}
                          onClick={() =>
                            updateGroup(g.key, {
                              item_ids: moveEntry(g.item_ids, i, -1),
                            })
                          }
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("carteMoveDown")}
                          disabled={
                            !canEdit || busy || i === g.item_ids.length - 1
                          }
                          onClick={() =>
                            updateGroup(g.key, {
                              item_ids: moveEntry(g.item_ids, i, 1),
                            })
                          }
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-[var(--fg-muted)]">
              {t("carteSharedLibraryHint")}
            </p>
            <Button
              variant="ghost"
              disabled={!canEdit || busy || (!dirty && !state?.has_draft)}
              onClick={() => setConfirmation("discard")}
            >
              {t("carteDiscardDraft")}
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPanel(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
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
        <DialogContent>
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
      <Dialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("carteChooseItems")}</DialogTitle>
            <DialogDescription>{t("carteChooseHint")}</DialogDescription>
          </DialogHeader>
          <input
            className="input"
            aria-label={t("search")}
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-96 overflow-y-auto divide-y">
            {items
              .filter((item) =>
                item.name
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map((item) => {
                const target = doc?.groups.find((g) => g.key === picker);
                return (
                  <label className="flex gap-3 items-center py-3" key={item.id}>
                    <input
                      type="checkbox"
                      checked={target?.item_ids.includes(item.id) || false}
                      disabled={!canEdit || busy}
                      onChange={(e) => {
                        if (target)
                          updateGroup(target.key, {
                            item_ids: e.target.checked
                              ? [...target.item_ids, item.id]
                              : target.item_ids.filter((id) => id !== item.id),
                          });
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                );
              })}
          </div>
          <Button variant="secondary" onClick={() => setPicker(null)}>
            {t("close")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={historyItem !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryItem(null);
        }}
      >
        <DialogContent className="sm:max-w-5xl">
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
