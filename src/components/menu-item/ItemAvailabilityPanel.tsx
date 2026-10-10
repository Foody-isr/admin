'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Box, ChevronDown } from 'lucide-react';
import {
  listAvailabilityRules,
  previewItemAvailability,
  updateMenuItem,
  setItemOptionStock,
  type AvailabilityRule,
  type AvailabilityPreview,
  type AvailabilityOverride,
  type MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { parsePortionGrams } from '@/lib/production';
import { toBaseUnit, convertQuantity } from '@/lib/units';
import {
  preparationSummary,
  type ItemPreparationDraft,
} from '@/lib/item-preparation';
import { AvailabilityCapacityCard } from './AvailabilityCapacityCard';
import { ItemSettingsDialog } from './ItemSettingsDialog';
import { ItemPreparationDialog } from './ItemPreparationDialog';

type StockUnit = '' | 'g' | 'kg';
type StockDraft = {
  tracked: boolean;
  mode: 'shared' | 'per_variant';
  unit: StockUnit;
  quantity: number;
  sizes: Record<number, number>;
  ruleId: number;
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Lets the item editor persist the applied settings with its Save action. */
export interface ItemAvailabilityPanelHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}
interface Props {
  rid: number;
  itemId: number;
  item: MenuItem;
  defaultStockUnit?: StockUnit;
  defaultLeadMinutes?: number;
  onSaved?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

const ItemAvailabilityPanel = forwardRef<ItemAvailabilityPanelHandle, Props>(
  function ItemAvailabilityPanel(
    {
      rid,
      itemId,
      item,
      defaultStockUnit = '',
      defaultLeadMinutes = 0,
      onSaved,
      onDirtyChange,
    },
    ref,
  ) {
    const { t, locale, direction } = useI18n();
    const { hasAnyPermission } = usePermissions();
    const canEdit = hasAnyPermission('menu.edit');
    const sizeSet = item.option_sets?.[0];
    const sizes = useMemo(
      () =>
        (sizeSet?.options ?? []).filter((option) => option.is_active !== false),
      [sizeSet],
    );
    const weighted =
      sizes.length > 0 &&
      sizes.every((option) => parsePortionGrams(option.name) != null);
    const [stock, setStock] = useState<StockDraft>(() => {
      const unit: StockUnit =
        item.stock_unit === 'kg'
          ? 'kg'
          : item.stock_unit === 'g' || item.stock_mode === 'measure'
            ? 'g'
            : weighted
              ? defaultStockUnit
              : '';
      return {
        tracked:
          item.stock_quantity != null || item.stock_mode === 'per_variant',
        mode: item.stock_mode === 'per_variant' ? 'per_variant' : 'shared',
        unit,
        quantity:
          item.stock_mode === 'measure'
            ? round2(
                convertQuantity(item.stock_quantity ?? 0, 'g', unit || 'g'),
              )
            : (item.stock_quantity ?? 0),
        sizes: Object.fromEntries(
          sizes.map((option) => [
            option.id,
            unit
              ? round2(
                  convertQuantity(
                    (option.stock_remaining ?? 0) *
                      (parsePortionGrams(option.name) ?? 0),
                    'g',
                    unit,
                  ),
                )
              : (option.stock_remaining ?? 0),
          ]),
        ),
        ruleId: item.availability_rule_id ?? 0,
      };
    });
    const [override, setOverride] = useState<AvailabilityOverride>(
      item.availability_override ?? 'auto',
    );
    const [preparation, setPreparation] = useState<ItemPreparationDraft>({
      leadMinutes: item.preparation_lead_time_minutes ?? null,
      schedule: item.preparation_schedule ?? null,
      saleMode: item.immediate_sale_mode ?? '',
    });
    const [saved, setSaved] = useState(() => ({
      stock,
      override,
      preparation,
    }));
    const dirty = !same(saved, { stock, override, preparation });
    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    const [stockDraft, setStockDraft] = useState<StockDraft | null>(null);
    const [statusDraft, setStatusDraft] = useState<AvailabilityOverride | null>(
      null,
    );
    const [prepOpen, setPrepOpen] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [capacityOpen, setCapacityOpen] = useState(false);
    const [rules, setRules] = useState<AvailabilityRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
    const [previewFailed, setPreviewFailed] = useState(false);
    const loadPreview = useCallback(async () => {
      setPreviewFailed(false);
      try {
        setPreview(await previewItemAvailability(rid, itemId));
      } catch {
        setPreview(null);
        setPreviewFailed(true);
      }
    }, [rid, itemId]);
    useEffect(() => {
      let alive = true;
      setLoading(true);
      setLoadError(false);
      listAvailabilityRules(rid)
        .then((value) => {
          if (alive) setRules(value);
        })
        .catch(() => {
          if (alive) setLoadError(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      void loadPreview();
      return () => {
        alive = false;
      };
    }, [rid, attempt, loadPreview]);
    const readyEligible =
      stock.tracked && stock.mode === 'shared' && stock.unit === '';
    const save = useCallback(async () => {
      if (!canEdit || !dirty) return;
      if (loading || loadError)
        throw new Error(t('itemAvailabilityLoadRequired'));
      const fields = {
        availability_rule_id: stock.ruleId,
        availability_override: override,
        preparation_lead_time_minutes: preparation.leadMinutes,
        preparation_schedule: preparation.schedule,
        immediate_sale_mode: preparation.saleMode,
      };
      if (!stock.tracked)
        await updateMenuItem(rid, itemId, {
          ...fields,
          stock_quantity: null,
          stock_mode: '',
          stock_unit: '',
        });
      else if (stock.mode === 'per_variant' && sizeSet) {
        await Promise.all(
          sizes.map((option) =>
            setItemOptionStock(
              rid,
              sizeSet.id,
              itemId,
              option.id,
              stock.unit
                ? Math.floor(
                    toBaseUnit(stock.sizes[option.id] ?? 0, stock.unit) /
                      (parsePortionGrams(option.name) ?? 1),
                  )
                : (stock.sizes[option.id] ?? 0),
            ),
          ),
        );
        await updateMenuItem(rid, itemId, {
          ...fields,
          stock_quantity: null,
          stock_mode: 'per_variant',
          stock_unit: stock.unit,
        });
      } else
        await updateMenuItem(rid, itemId, {
          ...fields,
          stock_quantity: stock.unit
            ? Math.round(toBaseUnit(stock.quantity, stock.unit))
            : stock.quantity,
          stock_mode: stock.unit ? 'measure' : 'count',
          stock_unit: stock.unit,
        });
      setSaved({ stock, override, preparation });
      await loadPreview();
      await onSaved?.();
    }, [
      canEdit,
      dirty,
      loading,
      loadError,
      t,
      stock,
      override,
      preparation,
      rid,
      itemId,
      sizeSet,
      sizes,
      loadPreview,
      onSaved,
    ]);
    useImperativeHandle(ref, () => ({ save, isDirty: () => dirty }), [
      save,
      dirty,
    ]);

    const changeUnit = (unit: StockUnit) => {
      if (!stockDraft) return;
      const previous = stockDraft.unit;
      const quantities = Object.fromEntries(
        sizes.map((option) => {
          const grams = parsePortionGrams(option.name) ?? 1;
          const count = previous
            ? Math.floor(
                toBaseUnit(stockDraft.sizes[option.id] ?? 0, previous) / grams,
              )
            : (stockDraft.sizes[option.id] ?? 0);
          return [
            option.id,
            unit ? round2(convertQuantity(count * grams, 'g', unit)) : count,
          ];
        }),
      );
      setStockDraft({
        ...stockDraft,
        unit,
        sizes: quantities,
        quantity:
          previous && unit
            ? round2(convertQuantity(stockDraft.quantity, previous, unit))
            : previous === unit
              ? stockDraft.quantity
              : 0,
      });
    };
    const stockValid =
      stockDraft != null &&
      (!stockDraft.tracked ||
        (stockDraft.mode === 'shared'
          ? [stockDraft.quantity]
          : sizes.map((option) => stockDraft.sizes[option.id] ?? 0)
        ).every(
          (value) =>
            Number.isFinite(value) &&
            value >= 0 &&
            (stockDraft.unit !== '' || Number.isSafeInteger(value)),
        ));
    const stockDisablesReady =
      stockDraft &&
      (!stockDraft.tracked ||
        stockDraft.mode !== 'shared' ||
        stockDraft.unit !== '') &&
      preparation.saleMode !== '';
    const appliedStockChanged =
      !same(saved.stock, stock) || saved.override !== override;
    const status =
      override === 'force_available'
        ? 'available'
        : override === 'force_sold_out'
          ? 'sold_out'
          : appliedStockChanged
            ? 'pending'
            : (preview?.state ?? 'unknown');
    const stateLabel = t(
      status === 'available'
        ? 'availabilityStateAvailable'
        : status === 'low'
          ? 'availabilityStateLow'
          : status === 'sold_out'
            ? 'availabilityStateSoldOut'
            : status === 'hidden'
              ? 'availabilityStateHidden'
              : status === 'pending'
                ? 'itemStockRecalculate'
                : previewFailed
                  ? 'availabilityPreviewUnavailableShort'
                  : 'availabilityComputing',
    );
    const modes: { value: AvailabilityOverride; key: string }[] = [
      { value: 'auto', key: 'availabilityOverrideAuto' },
      { value: 'force_available', key: 'availabilityOverrideForceAvailable' },
      { value: 'force_sold_out', key: 'availabilityOverrideForceSoldOut' },
    ];
    const unitLabel = stock.unit || t('availabilityPortions');
    const quantity = stock.tracked
      ? stock.mode === 'per_variant'
        ? t('itemStockBySize')
        : `${new Intl.NumberFormat(locale).format(stock.quantity)} ${unitLabel}`
      : appliedStockChanged || !preview
        ? '—'
        : preview.unlimited
          ? '∞'
          : String(preview.count ?? preview.buildable ?? '—');
    const editStock = () => {
      setActionsOpen(false);
      setStockDraft(structuredClone(stock));
    };

    if (loading) return <p role="status">{t('loading')}</p>;
    if (loadError)
      return (
        <div role="alert">
          <p>{t('itemAvailabilityLoadRequired')}</p>
          <button
            type="button"
            className="item-settings-link"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('retry')}
          </button>
        </div>
      );
    return (
      <div className="item-fulfillment-settings">
        <div className="item-stock-actions">
          <Popover.Root open={actionsOpen} onOpenChange={setActionsOpen}>
            <Popover.Trigger asChild>
              <button type="button" className="item-settings-link">
                {t('actions')}
                <ChevronDown size={18} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                dir={direction}
                align="end"
                sideOffset={8}
                className="item-editor item-settings-popover item-settings-menu"
              >
                <button type="button" disabled={!canEdit} onClick={editStock}>
                  {t('itemStockTracking')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    setCapacityOpen(true);
                  }}
                >
                  {t('itemStockViewCalculation')}
                </button>
                <Link href={`/${rid}/settings/stock/availability`}>
                  {t('availabilityManageRules')}
                </Link>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <table className="item-stock-table">
          <thead>
            <tr>
              <th>{t('itemStockArticle')}</th>
              <th>{t('itemStockQuantity')}</th>
              <th>{t('itemStockStatus')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {item.name}
                <span>
                  {t(
                    stock.tracked
                      ? stock.mode === 'per_variant'
                        ? 'itemStockBySize'
                        : 'itemStockCounted'
                      : 'itemStockRecipe',
                  )}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="item-stock-quantity"
                  disabled={!canEdit}
                  onClick={editStock}
                >
                  {quantity}
                </button>
              </td>
              <td>
                <Popover.Root
                  open={statusDraft !== null}
                  onOpenChange={(open) =>
                    setStatusDraft(open ? override : null)
                  }
                >
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="item-stock-status"
                      data-state-tone={status}
                      disabled={!canEdit}
                      aria-label={`${t('itemStockStatus')}: ${stateLabel}`}
                    >
                      {stateLabel}
                      <ChevronDown size={16} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      dir={direction}
                      align="end"
                      sideOffset={8}
                      className="item-editor item-settings-popover"
                      onInteractOutside={() => setStatusDraft(null)}
                    >
                      <div role="radiogroup" aria-label={t('itemStockStatus')}>
                        {modes.map((mode) => (
                          <label key={mode.value} className="item-stock-choice selection-row">
                            <input
                              type="radio"
                              name="availability-status"
                              checked={statusDraft === mode.value}
                              onChange={() => setStatusDraft(mode.value)}
                            />
                            <span>
                              {t(mode.key)}
                              <small>{t(`${mode.key}Desc`)}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="item-settings-popover-footer">
                        <button
                          type="button"
                          className="item-settings-secondary"
                          onClick={() => setStatusDraft(null)}
                        >
                          {t('cancel')}
                        </button>
                        <button
                          type="button"
                          className="item-settings-primary"
                          onClick={() => {
                            setOverride(statusDraft!);
                            setStatusDraft(null);
                          }}
                        >
                          {t('apply')}
                        </button>
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </td>
            </tr>
          </tbody>
        </table>
        <section className="item-execution-section">
          <h3>
            <span>
              <Box size={24} />
            </span>
            {t('itemPrepSection')}
          </h3>
          <div className="item-settings-row item-settings-row-plain item-preparation-row">
            <div>
              <h4>{t('itemPrepTitle')}</h4>
              <div className="item-preparation-summary">
                {preparationSummary(
                  preparation,
                  defaultLeadMinutes,
                  locale,
                  t,
                ).map((line, index) => (
                  <p key={index}>
                    {line.days && <strong>{line.days} : </strong>}
                    {line.preparation}
                    {line.deadline && <span>{line.deadline}</span>}
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              className="item-settings-link"
              onClick={() => setPrepOpen(true)}
            >
              {t('edit')}
            </button>
          </div>
        </section>
        {prepOpen && (
          <ItemPreparationDialog
            value={preparation}
            defaultLeadMinutes={defaultLeadMinutes}
            readyStockEligible={readyEligible}
            onClose={() => setPrepOpen(false)}
            onApply={(draft) => {
              setPreparation(draft);
              setPrepOpen(false);
            }}
          />
        )}
        {capacityOpen && (
          <ItemSettingsDialog
            title={t('itemStockViewCalculation')}
            onClose={() => setCapacityOpen(false)}
            onApply={() => setCapacityOpen(false)}
          >
            <AvailabilityCapacityCard
              preview={preview}
              failed={previewFailed}
            />
            <p className="item-settings-footnote">
              {t('itemStockSavedCalculation')}
            </p>
          </ItemSettingsDialog>
        )}
        {stockDraft && (
          <ItemSettingsDialog
            title={t('itemStockTracking')}
            description={t('itemStockDescription')}
            onClose={() => setStockDraft(null)}
            applyDisabled={!stockValid}
            onApply={() => {
              setStock(stockDraft);
              if (stockDisablesReady)
                setPreparation({ ...preparation, saleMode: '' });
              setStockDraft(null);
            }}
          >
            <div className="item-settings-stack">
              <label>
                {t('itemStockSource')}
                <select
                  value={stockDraft.tracked ? 'count' : 'recipe'}
                  onChange={(event) =>
                    setStockDraft({
                      ...stockDraft,
                      tracked: event.target.value === 'count',
                    })
                  }
                >
                  <option value="recipe">{t('itemStockRecipe')}</option>
                  <option value="count">{t('itemStockCounted')}</option>
                </select>
              </label>
              {stockDraft.tracked && (
                <>
                  {sizes.length > 0 && (
                    <label>
                      {t('itemStockTrackingMode')}
                      <select
                        value={stockDraft.mode}
                        onChange={(event) =>
                          setStockDraft({
                            ...stockDraft,
                            mode: event.target.value as StockDraft['mode'],
                          })
                        }
                      >
                        <option value="shared">{t('itemStockShared')}</option>
                        <option value="per_variant">
                          {t('itemStockBySize')}
                        </option>
                      </select>
                    </label>
                  )}
                  {(weighted || stockDraft.unit) && (
                    <label>
                      {t('stockUnit')}
                      <select
                        value={stockDraft.unit}
                        onChange={(event) =>
                          changeUnit(event.target.value as StockUnit)
                        }
                      >
                        <option value="">{t('availabilityPortions')}</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                      </select>
                    </label>
                  )}
                  <div className="item-stock-edit-table">
                    {(stockDraft.mode === 'per_variant'
                      ? sizes.map((option) => ({
                          id: option.id,
                          name: option.name,
                          value: stockDraft.sizes[option.id] ?? 0,
                        }))
                      : [
                          {
                            id: 0,
                            name: t('itemStockQuantity'),
                            value: stockDraft.quantity,
                          },
                        ]
                    ).map((row) => (
                      <label key={row.id}>
                        {row.name}
                        <span>
                          <input
                            type="number"
                            min={0}
                            step={stockDraft.unit ? 'any' : 1}
                            value={Number.isNaN(row.value) ? '' : row.value}
                            onChange={(event) => {
                              const value =
                                event.target.value === ''
                                  ? NaN
                                  : Number(event.target.value);
                              setStockDraft(
                                row.id === 0
                                  ? { ...stockDraft, quantity: value }
                                  : {
                                      ...stockDraft,
                                      sizes: {
                                        ...stockDraft.sizes,
                                        [row.id]: value,
                                      },
                                    },
                              );
                            }}
                          />
                          <span>
                            {stockDraft.unit || t('availabilityPortions')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <label>
                {t('availabilityRuleField')}
                <select
                  value={stockDraft.ruleId}
                  onChange={(event) =>
                    setStockDraft({
                      ...stockDraft,
                      ruleId: Number(event.target.value),
                    })
                  }
                >
                  <option value={0}>{t('itemStockDefaultRule')}</option>
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="item-settings-description">
                {t('availabilityRuleHelp')}
              </p>
              {stockDisablesReady && (
                <p className="item-settings-notice" role="status">
                  {t('itemStockDisablesReady')}
                </p>
              )}
            </div>
          </ItemSettingsDialog>
        )}
      </div>
    );
  },
);

export default ItemAvailabilityPanel;
