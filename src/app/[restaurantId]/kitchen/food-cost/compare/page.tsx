'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAllCategories, getRestaurantSettings, getMenuItemIngredients, getItemOptionPrices, type MenuItem, type MenuItemIngredient, type ItemOptionOverride } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { COST_THRESHOLD, computeItemCostSummary } from '@/lib/cost-utils';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import FoodCostBreakdownModal from '@/components/food-cost/FoodCostBreakdownModal';
import { AlertTriangle, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Button, FullScreenEditor } from '@/components/ds';

type ComparedItem = MenuItem & { category_name: string };
type Comparison = { items: ComparedItem[]; ingredients: Record<number, MenuItemIngredient[]>; overrides: Record<number, ItemOptionOverride[]>; vatRate: number };

/** Compare two to six catalog items using the shared, unchanged cost calculation. */
export default function CompareCostsPage() {
  const { restaurantId } = useParams();
  const params = useSearchParams();
  const raw = params.get('ids') ?? '';
  const ids = useMemo(() => Array.from(new Set(raw.split(',').map(value => Number(value.trim())).filter(id => Number.isSafeInteger(id) && id > 0))), [raw]);
  const remaining = new URLSearchParams(params.toString());
  remaining.delete('ids');
  const returnUrl = `/${restaurantId}/kitchen/food-cost${remaining.size ? `?${remaining}` : ''}`;
  return <ComparisonWorkspace key={`${restaurantId}:${ids.join(',')}`} rid={Number(restaurantId)} ids={ids} returnUrl={returnUrl}/>;
}

function ComparisonWorkspace({ rid, ids, returnUrl }: {rid: number; ids: number[]; returnUrl: string}) {
  const { money } = useCurrency();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const valid = ids.length >= 2 && ids.length <= 6;
  const generation = useRef({value:0});
  const [data, setData] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [showCostsExVat, setShowCostsExVat] = useState(true);
  const [ratioId, setRatioId] = useState<number | null>(null);
  const [costId, setCostId] = useState<number | null>(null);
  const percent = (value: number, digits = 1) => new Intl.NumberFormat(locale, {style:'percent', minimumFractionDigits:digits, maximumFractionDigits:digits}).format(value);
  const load = useCallback(async () => {
    if (!valid) return;
    const request = ++generation.current.value;
    setLoading(true); setError(false); setMissing(false);
    try {
      const [categories, settings] = await Promise.all([getAllCategories(rid), getRestaurantSettings(rid)]);
      if (request !== generation.current.value) return;
      const byId = new Map<number, ComparedItem>();
      for (const category of categories) for (const item of category.items ?? []) byId.set(item.id, {...item, category_name: category.name});
      if (ids.some(id => !byId.has(id))) { setMissing(true); setData(null); return; }
      const [recipes, overrides] = await Promise.all([
        Promise.all(ids.map(id => getMenuItemIngredients(rid, id))),
        Promise.all(ids.map(id => getItemOptionPrices(rid, id))),
      ]);
      if (request !== generation.current.value) return;
      setData({ items:ids.map(id => byId.get(id)!), vatRate:settings.vat_rate ?? 18,
        ingredients:Object.fromEntries(ids.map((id, index) => [id, recipes[index]])),
        overrides:Object.fromEntries(ids.map((id, index) => [id, overrides[index]])) });
    } catch { if (request === generation.current.value) setError(true); }
    finally { if (request === generation.current.value) setLoading(false); }
  }, [rid, ids, valid]);
  useEffect(() => {
    if (!valid) { router.replace(returnUrl); return; }
    void load();
    const current = generation.current;
    return () => { current.value++; };
  }, [load, valid, returnUrl, router]);

  const summaries = useMemo(() => data?.items.map(item => ({item, s:computeItemCostSummary({item, ingredients:data.ingredients[item.id], overrides:data.overrides[item.id], vatRate:data.vatRate, showCostsExVat})})) ?? [], [data, showCostsExVat]);
  const ratio = summaries.find(row => row.item.id === ratioId);
  const cost = summaries.find(row => row.item.id === costId);
  // Only displayed, valid values participate. Missing recipes are never ranked as zero-cost winners.
  const ranks = (values: Array<number | null>, better: 'min' | 'max') => values.map(value => {
    const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (value == null || finite.length < 2 || Math.min(...finite) === Math.max(...finite)) return null;
    if (value === Math.min(...finite)) return {label:t('compareLowest'), favorable:better === 'min'};
    if (value === Math.max(...finite)) return {label:t('compareHighest'), favorable:better === 'max'};
    return null;
  });
  const priceRanks = ranks(summaries.map(({s}) => s.displayPrice > 0 ? s.displayPrice : null), 'min');
  const costRanks = ranks(summaries.map(({s}) => s.hasIngredients && !s.configIssues.length ? s.foodCost : null), 'min');
  const ratioRanks = ranks(summaries.map(({s}) => s.displayPrice > 0 && s.hasIngredients && !s.configIssues.length ? s.costPct : null), 'min');
  const marginRanks = ranks(summaries.map(({s}) => s.displayPrice > 0 && s.hasIngredients && !s.configIssues.length ? s.margin : null), 'max');

  return <FullScreenEditor open title={t('compareCosts')} subtitle={t('selectedCount').replace('{n}', String(ids.length))}
    showCancel={false} onOpenChange={open => {if (!open) router.push(returnUrl);}} contentClassName="p-4 md:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl space-y-1"><p className="text-sm text-fg-secondary">{t('compareBasisHint')}</p><p className="text-xs text-fg-secondary">{t('compareScrollHint')}</p></div>
      <Button size="lg" variant="secondary" aria-pressed={!showCostsExVat} onClick={() => setShowCostsExVat(value => !value)}>{t(showCostsExVat ? 'showIncVat' : 'showExVat')}</Button>
    </div>
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p> : error || missing ?
      <div role="alert" className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"><p>{t(missing ? 'compareItemsUnavailable' : 'errorLoading')}</p><div className="flex flex-wrap gap-3"><Button size="lg" variant="secondary" onClick={() => void load()}>{t('retry')}</Button><Button size="lg" variant="ghost" onClick={() => router.push(returnUrl)}>{t('back')}</Button></div></div> : data &&
      <div role="region" tabIndex={0} aria-label={t('compareCosts')} className="overflow-x-auto overscroll-x-contain rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <table className="w-full table-fixed text-sm" style={{minWidth:120 + summaries.length * 210}}>
          <caption className="sr-only">{t('compareCosts')} — {t(showCostsExVat ? 'excludingVat' : 'includingVat')}</caption>
          <colgroup><col className="w-[120px] md:w-[180px]"/>{summaries.map(({item}) => <col key={item.id}/>)}</colgroup>
          <thead><tr><th scope="col" className="sticky start-0 z-10 bg-[var(--surface-2)] p-4 text-start align-bottom border-e border-[var(--line)] text-fg-secondary font-medium">{t(showCostsExVat ? 'excludingVat' : 'includingVat')}</th>
            {summaries.map(({item,s}) => <th scope="col" key={item.id} className="p-4 text-start align-top border-e border-[var(--line)] last:border-e-0 font-normal">
              <div className="flex items-start gap-3 mb-3">
                {item.image_url ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt="" className="size-10 rounded-r-md object-cover shrink-0"/>
                </> : <span className="size-10 shrink-0 grid place-items-center rounded-r-md bg-[var(--surface-2)] text-fg-secondary"><ImageIcon aria-hidden className="size-5"/></span>}
                <div className="min-w-0"><span dir="auto" className="block font-semibold break-words">{item.name}</span><span dir="auto" className="block mt-1 text-xs text-fg-secondary break-words">{item.category_name}</span></div>
              </div>
              {s.activeVariant && <span dir="auto" className="inline-flex rounded-r-md bg-[var(--info-50)] text-[var(--info-500)] px-2 py-1 text-xs mb-2">{s.activeVariant.name}</span>}
              {canManage && <Link href={`/${rid}/menu/items/${item.id}?tab=recipe`} className="flex items-center gap-2 min-h-11 text-xs font-medium text-[var(--brand-ink)] underline underline-offset-4" aria-label={`${t('openItemCta')} — ${item.name}`}>{t('openItemCta')}<ExternalLink aria-hidden className="size-3.5"/></Link>}
            </th>)}
          </tr></thead>
          <tbody>
            <MetricRow label={t('metricPrice')}>{summaries.map(({item,s},index) => <Cell key={item.id} rank={priceRanks[index]}>{s.displayPrice > 0 ? <bdi>{money(s.displayPrice)}</bdi> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricFoodCost')}>{summaries.map(({item,s},index) => <Cell key={item.id} rank={costRanks[index]}>{s.hasIngredients ? <button type="button" className="min-h-11 underline underline-offset-4 text-start" onClick={() => setCostId(item.id)} aria-label={`${t('showFoodCostBreakdown')} — ${item.name}`}><bdi>{money(s.foodCost)}</bdi></button> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricCostPct')}>{summaries.map(({item,s},index) => <Cell key={item.id} rank={ratioRanks[index]}>{s.displayPrice > 0 && s.hasIngredients ? <><button type="button" className="min-h-11 underline underline-offset-4 text-start" onClick={() => setRatioId(item.id)} aria-label={`${t('showCostBreakdown')} — ${item.name}`}><bdi>{percent(s.costPct)}</bdi></button>{s.costPct > COST_THRESHOLD && <p className="text-xs text-[var(--warning-500)] mt-1 flex items-start gap-1.5"><AlertTriangle aria-hidden className="size-4 shrink-0"/>{t('foodCostExceedsThreshold').replace('{threshold}', String(COST_THRESHOLD * 100))}</p>}</> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricMargin')}>{summaries.map(({item,s},index) => <Cell key={item.id} rank={marginRanks[index]}>{s.displayPrice > 0 && s.hasIngredients ? <bdi>{money(s.margin)}</bdi> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricTopIngredient')}>{summaries.map(({item,s}) => <Cell key={item.id}>{s.topIngredient ? <><span dir="auto">{s.topIngredient.name}</span> <bdi className="text-xs text-fg-secondary">({percent(s.topIngredient.contributionPct,0)})</bdi></> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricIngredientCount')}>{summaries.map(({item,s}) => <Cell key={item.id}>{s.ingredientCount ? <details><summary className="min-h-11 flex items-center gap-2 cursor-pointer underline underline-offset-4" aria-label={`${t('ingredients')} — ${item.name}`}><bdi>{s.ingredientCount}</bdi> · {t('ingredients')}</summary><ul className="text-xs space-y-1 text-fg-secondary pb-2">{s.lines.map((line,index) => <li dir="auto" key={`${line.ingredient.id}:${index}`}>{line.name}</li>)}</ul></details> : '—'}</Cell>)}</MetricRow>
            <MetricRow label={t('metricConfigIssues')}>{summaries.map(({item,s}) => <Cell key={item.id}>{s.configIssues.length ? <ul className="space-y-3">{s.configIssues.map(({prep,issue}) => <li key={`${prep.id}:${issue}`} className="text-xs"><span className="flex items-start gap-2"><AlertTriangle aria-hidden className="size-4 shrink-0 text-[var(--warning-500)]"/><span><bdi className="font-semibold">{prep.name}</bdi> · {t(issue === 'missing_yield' ? 'prepMissingYield' : issue === 'no_ingredients' ? 'prepNoIngredients' : 'prepZeroCostIngredients')}</span></span>{canManage && <Link href={`/${rid}/kitchen/prep?edit=${prep.id}`} className="inline-flex min-h-11 items-center text-[var(--brand-ink)] underline underline-offset-4" aria-label={`${t('fix')} — ${prep.name}`}>{t('fix')}</Link>}</li>)}</ul> : '—'}</Cell>)}</MetricRow>
          </tbody>
        </table>
      </div>}
    {ratio && data && <CostPctBreakdownModal itemName={ratio.item.name} displayPrice={ratio.s.activeVariant?.price ?? ratio.item.price ?? 0} displayCost={ratio.s.foodCost} costPct={ratio.s.costPct} showCostsExVat={showCostsExVat} vatRate={data.vatRate} onClose={() => setRatioId(null)}/>}
    {cost && <FoodCostBreakdownModal itemName={cost.item.name} foodCost={cost.s.foodCost} lines={cost.s.lines} showCostsExVat={showCostsExVat} onClose={() => setCostId(null)}/>}
  </FullScreenEditor>;
}

function MetricRow({label, children}: {label: string; children: ReactNode}) {
  return <tr className="border-t border-[var(--line)]"><th scope="row" className="sticky start-0 z-10 bg-[var(--surface-2)] p-4 text-start text-xs font-medium text-fg-secondary border-e border-[var(--line)] align-top">{label}</th>{children}</tr>;
}
function Cell({children, rank}: {children: ReactNode; rank?: {label: string; favorable: boolean} | null}) {
  return <td className="p-4 align-top border-e border-[var(--line)] last:border-e-0 tabular-nums"><div>{children}</div>{rank && <span className={`inline-block mt-1.5 rounded-r-md px-2 py-1 text-xs ${rank.favorable ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--surface-2)] text-fg-secondary'}`}>{rank.label}</span>}</td>;
}
