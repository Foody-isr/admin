"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import type {
  AvailabilityOverride,
  CarteDocument,
  CarteDraftGroup,
  MenuItem,
  SaleStockOverview,
} from "@/lib/api";
import { moveEntry } from "@/lib/carte-editor";
import { useCurrency, useI18n } from "@/lib/i18n";
import ActionMenu from "@/components/common/ActionMenu";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./CarteEditor.module.css";

interface Props {
  rid: number;
  mid: number;
  doc: CarteDocument;
  items: MenuItem[];
  stock: SaleStockOverview | null;
  restaurantName: string;
  canEdit: boolean;
  busy: boolean;
  onEdit: (patch: Partial<CarteDocument>) => void;
  onGroupSettings: (key: string) => void;
  onChooseItems: (key: string) => void;
  onRemoveGroup: (key: string) => void;
  onHistory: (id: number) => void;
  onAvailability: (id: number, value: AvailabilityOverride) => void;
  onEditItem: (id: number) => void;
}

/** Carte membership is edited locally; table and contextual actions share the same draft. */
export function CarteGroups({
  rid,
  mid,
  doc,
  items,
  stock,
  restaurantName,
  canEdit,
  busy,
  onEdit,
  onGroupSettings,
  onChooseItems,
  onRemoveGroup,
  onHistory,
  onAvailability,
  onEditItem,
}: Props) {
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{
    group: string;
    ids: number[];
  } | null>(null);
  const [drag, setDrag] = useState<{ group: string; id?: number } | null>(null);
  const itemHref = (id: number) =>
    `/${rid}/menu/items/${id}?from=${encodeURIComponent(`/${rid}/menu/menus/${mid}`)}`;
  const library = new Map(items.map((item) => [item.id, item]));
  const update = (group: CarteDraftGroup, patch: Partial<CarteDraftGroup>) =>
    onEdit({
      groups: doc.groups.map((value) =>
        value.key === group.key ? { ...value, ...patch } : value,
      ),
    });
  const select = (group: CarteDraftGroup, ids: number[]) =>
    setSelected(ids.length ? { group: group.key, ids } : null);
  function moveSelected(group: CarteDraftGroup, target: string) {
    if (!selected || selected.group !== group.key || !target) return;
    onEdit({
      groups: doc.groups.map((value) =>
        value.key === group.key
          ? {
              ...value,
              item_ids: value.item_ids.filter(
                (id) => !selected.ids.includes(id),
              ),
            }
          : value.key === target
            ? {
                ...value,
                item_ids: [
                  ...value.item_ids,
                  ...selected.ids.filter((id) => !value.item_ids.includes(id)),
                ],
              }
            : value,
      ),
    });
    setSelected(null);
  }

  return (
    <div className={styles.groups} aria-label={t("carteGroups")}>
      {doc.groups.map((group, groupIndex) => {
        const open =
          expanded[group.key] ?? (groupIndex === 0 || group.id === 0);
        const checked = selected?.group === group.key ? selected.ids : [];
        const name = group.name || t("carteUntitled");
        const controlId = `carte-group-${group.key}`;
        return (
          <section
            key={group.key}
            className={styles.group}
            data-carte-group={group.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!drag || drag.id !== undefined || !canEdit || busy) return;
              const source = doc.groups.findIndex(
                (value) => value.key === drag.group,
              );
              if (source >= 0 && source !== groupIndex) {
                const groups = [...doc.groups];
                const [moved] = groups.splice(source, 1);
                groups.splice(groupIndex, 0, moved);
                onEdit({ groups });
              }
              setDrag(null);
            }}
          >
            <header
              className={`${styles.groupHeader} ${!open ? styles.collapsed : ""}`}
            >
              <button
                className={styles.collapseButton}
                type="button"
                aria-expanded={open}
                aria-controls={controlId}
                aria-label={name}
                onClick={() =>
                  setExpanded((value) => ({ ...value, [group.key]: !open }))
                }
              >
                {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              </button>
              <h2
                className={styles.groupTitle}
                draggable={canEdit && !busy}
                onDragStart={() => setDrag({ group: group.key })}
                onDragEnd={() => setDrag(null)}
              >
                {name}
              </h2>
              {group.is_hidden && (
                <span className={styles.chip}>{t("carteHidden")}</span>
              )}
              {canEdit && (
                <ActionMenu
                  label={t("carteGroupActions").replace("{name}", name)}
                  iconOnly
                  className={styles.menuTrigger}
                  actions={[
                    {
                      label: t("carteEditGroup"),
                      onClick: () => onGroupSettings(group.key),
                      disabled: busy,
                    },
                    {
                      label: t("carteChooseItems"),
                      onClick: () => onChooseItems(group.key),
                      disabled: busy,
                    },
                    {
                      label: t("carteMoveUp"),
                      icon: <ArrowUp />,
                      disabled: busy || groupIndex === 0,
                      onClick: () =>
                        onEdit({
                          groups: moveEntry(doc.groups, groupIndex, -1),
                        }),
                    },
                    {
                      label: t("carteMoveDown"),
                      icon: <ArrowDown />,
                      disabled: busy || groupIndex === doc.groups.length - 1,
                      onClick: () =>
                        onEdit({
                          groups: moveEntry(doc.groups, groupIndex, 1),
                        }),
                    },
                    {
                      label: t("delete"),
                      variant: "danger",
                      disabled: busy,
                      onClick: () => onRemoveGroup(group.key),
                    },
                  ]}
                >
                  <MoreHorizontal aria-hidden />
                </ActionMenu>
              )}
            </header>
            {open && (
              <div id={controlId} className={styles.groupBody}>
                {checked.length > 0 && (
                  <div className={styles.selectionBar}>
                    <span>
                      {checked.length} {t("carteSelected")}
                    </span>
                    <select
                      aria-label={t("carteMoveTo")}
                      value=""
                      disabled={busy || !canEdit}
                      onChange={(event) =>
                        moveSelected(group, event.target.value)
                      }
                    >
                      <option value="">{t("carteMoveTo")}</option>
                      {doc.groups
                        .filter((value) => value.key !== group.key)
                        .map((value) => (
                          <option value={value.key} key={value.key}>
                            {value.name || t("carteUntitled")}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !canEdit}
                      onClick={() => {
                        update(group, {
                          item_ids: group.item_ids.filter(
                            (id) => !checked.includes(id),
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      {t("carteRemoveSelected")}
                    </button>
                    <button type="button" onClick={() => setSelected(null)}>
                      {t("cancel")}
                    </button>
                  </div>
                )}
                <div className={styles.tableScroll}>
                  <table className={styles.table} aria-label={name}>
                    <colgroup>
                      <col className={styles.selectionColumn} />
                      <col className={styles.articleColumn} />
                      <col className={styles.locationColumn} />
                      <col className={styles.channelColumn} />
                      <col className={styles.modifierColumn} />
                      <col className={styles.priceColumn} />
                      <col className={styles.actionsColumn} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={styles.selectionCell}>
                          <Checkbox
                            className={styles.checkbox}
                            disabled={
                              !canEdit || busy || !group.item_ids.length
                            }
                            aria-label={t("carteSelectGroup").replace(
                              "{name}",
                              name,
                            )}
                            checked={
                              checked.length === group.item_ids.length &&
                              checked.length > 0
                                ? true
                                : checked.length
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(value) =>
                              select(
                                group,
                                value === true ? [...group.item_ids] : [],
                              )
                            }
                          />
                        </th>
                        <th>{t("item")}</th>
                        <th className={styles.locationColumn}>
                          {t("carteLocations")}
                        </th>
                        <th className={styles.channelColumn}>
                          {t("channels")}
                        </th>
                        <th className={styles.modifierColumn}>
                          {t("modifiers")}
                        </th>
                        <th>{t("price")}</th>
                        <th>
                          <span className="sr-only">{t("actions")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.item_ids.map((id, itemIndex) => {
                        const item = library.get(id);
                        const status = stock?.rows.find(
                          (row) => row.item.id === id,
                        );
                        const override =
                          status?.config?.override ??
                          (status?.managed
                            ? "auto"
                            : (item?.availability_override ?? "auto"));
                        const count = status?.availability.buildable_count;
                        const availability =
                          override === "force_sold_out" ||
                          status?.availability.availability_state ===
                            "sold_out" ||
                          status?.availability.availability_state === "hidden"
                            ? t("carteSoldOut")
                            : override === "force_available"
                              ? t("carteAlwaysAvailable")
                              : count != null
                                ? t("carteStockRemaining").replace(
                                    "{count}",
                                    new Intl.NumberFormat(locale).format(count),
                                  )
                                : t("available");
                        const pending = doc.stocks?.some(
                          (limit) => limit.menu_item_id === id,
                        );
                        const pos =
                          doc.pos_enabled &&
                          group.pos_enabled &&
                          !group.is_hidden &&
                          item?.is_active !== false;
                        const web =
                          doc.web_enabled &&
                          group.web_enabled &&
                          !group.is_hidden &&
                          item?.is_active !== false;
                        const modifiers = item?.modifier_sets ?? [];
                        return (
                          <tr
                            key={id}
                            draggable={canEdit && !busy}
                            data-carte-item={id}
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDrag({ group: group.key, id });
                            }}
                            onDragEnd={() => setDrag(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              if (
                                drag?.group !== group.key ||
                                drag.id === undefined ||
                                !canEdit ||
                                busy
                              )
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              const next = [...group.item_ids];
                              const source = next.indexOf(drag.id);
                              if (source < 0) return;
                              next.splice(source, 1);
                              next.splice(itemIndex, 0, drag.id);
                              update(group, { item_ids: next });
                              setDrag(null);
                            }}
                          >
                            <td className={styles.selectionCell}>
                              <Checkbox
                                className={styles.checkbox}
                                disabled={!canEdit || busy}
                                aria-label={`${t("select")} ${item?.name || id}`}
                                checked={checked.includes(id)}
                                onCheckedChange={(value) =>
                                  select(
                                    group,
                                    value === true
                                      ? [...checked, id]
                                      : checked.filter((value) => value !== id),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <div className={styles.article}>
                                <span className={styles.thumbnail}>
                                  {item?.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={item.image_url}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span aria-hidden>
                                      {(item?.name || "").slice(0, 1)}
                                    </span>
                                  )}
                                </span>
                                <div className={styles.articleText}>
                                  <Link href={itemHref(id)} title={item?.name}>
                                    {item?.name || `#${id}`}
                                  </Link>
                                  <span
                                    className={styles.availability}
                                    data-sold-out={
                                      override === "force_sold_out" ||
                                      status?.availability
                                        .availability_state === "sold_out"
                                    }
                                  >
                                    {availability}
                                    {pending && (
                                      <span className={styles.pending}>
                                        {" "}
                                        · {t("cartePendingChange")}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className={styles.locationColumn}>
                              {restaurantName ? (
                                <span
                                  className={styles.chip}
                                  title={restaurantName}
                                >
                                  {restaurantName}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className={styles.channelColumn}>
                              <span className={styles.chip}>
                                {pos && web
                                  ? t("carteAllChannels")
                                  : pos
                                    ? t("cartePosChannel")
                                    : web
                                      ? t("carteWebChannel")
                                      : "—"}
                              </span>
                            </td>
                            <td className={styles.modifierColumn}>
                              <Link
                                className={styles.modifierLink}
                                href={`${itemHref(id)}&tab=details#item-personalizations`}
                                title={modifiers
                                  .map((value) => value.name)
                                  .join(", ")}
                              >
                                {modifiers.length
                                  ? `${modifiers[0].name}${modifiers.length > 1 ? ` +${modifiers.length - 1}` : ""}`
                                  : t("select")}
                              </Link>
                            </td>
                            <td className={styles.price}>
                              {item ? money(item.price) : "—"}
                            </td>
                            <td>
                              <ActionMenu
                                label={t("carteItemActions").replace(
                                  "{name}",
                                  item?.name || `#${id}`,
                                )}
                                iconOnly
                                className={styles.rowMenu}
                                actions={[
                                  {
                                    label: t(canEdit ? "editItem" : "view"),
                                    onClick: () => onEditItem(id),
                                    disabled: busy,
                                  },
                                  ...(stock?.series_key && canEdit
                                    ? [
                                        {
                                          label: t("carteAvailabilityTitle"),
                                          onClick: () =>
                                            onAvailability(id, override),
                                          disabled: busy,
                                        },
                                      ]
                                    : []),
                                  {
                                    label: t("saleStockHistory"),
                                    onClick: () => onHistory(id),
                                    disabled: busy,
                                  },
                                  ...(canEdit
                                    ? [
                                        {
                                          label: t("carteMoveUp"),
                                          icon: <ArrowUp />,
                                          disabled: busy || itemIndex === 0,
                                          onClick: () =>
                                            update(group, {
                                              item_ids: moveEntry(
                                                group.item_ids,
                                                itemIndex,
                                                -1,
                                              ),
                                            }),
                                        },
                                        {
                                          label: t("carteMoveDown"),
                                          icon: <ArrowDown />,
                                          disabled:
                                            busy ||
                                            itemIndex ===
                                              group.item_ids.length - 1,
                                          onClick: () =>
                                            update(group, {
                                              item_ids: moveEntry(
                                                group.item_ids,
                                                itemIndex,
                                                1,
                                              ),
                                            }),
                                        },
                                        {
                                          label: t("carteRemoveSelected"),
                                          variant: "danger" as const,
                                          disabled: busy,
                                          onClick: () => {
                                            update(group, {
                                              item_ids: group.item_ids.filter(
                                                (value) => value !== id,
                                              ),
                                            });
                                            setSelected(null);
                                          },
                                        },
                                      ]
                                    : []),
                                ]}
                              >
                                <MoreHorizontal aria-hidden />
                              </ActionMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.addItems}
                    disabled={busy}
                    onClick={() => onChooseItems(group.key)}
                  >
                    <span className={styles.addTile}>
                      <Plus aria-hidden />
                    </span>
                    <span>{t("carteAddItems")}</span>
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
