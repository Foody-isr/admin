'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FlaskConical, Info, Package, Search, X } from 'lucide-react';
import type { PrepItem, StockItem } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

// Retain the existing distinction between raw stock and kitchen preparations.
export const BRUT_COLOR = '#10b981';
export const PREP_COLOR = '#7c3aed';

interface Props {
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onPickBrut: (item: StockItem) => void;
  onPickPrep: (item: PrepItem) => void;
  onCreateBrut: (query: string) => void;
  onCreatePrep: (query: string) => void;
  onClose: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Searches both ingredient sources and keeps their inline creation paths available. */
export function RecipeComposer({ stockItems, prepItems, onPickBrut, onPickPrep, onCreateBrut, onCreatePrep, onClose, disabled, autoFocus }: Props) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const [query, setQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  const needle = query.trim().toLocaleLowerCase();
  const raw = needle ? stockItems.filter(item => item.is_active !== false && item.name.toLocaleLowerCase().includes(needle)) : [];
  const preps = needle ? prepItems.filter(item => item.is_active !== false && item.name.toLocaleLowerCase().includes(needle)) : [];
  const total = raw.length + preps.length;
  const types = [{kind:'brut',name:t('itemRecipeRaw'),hint:t('itemRecipeRawHint'),examples:t('itemRecipeRawExamples'),Icon:Package}, {kind:'prep',name:t('preparation'),hint:t('itemRecipePrepHint'),examples:t('itemRecipePrepExamples'),Icon:FlaskConical}] as const;
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface)] p-4">
    <div className="flex flex-wrap items-center gap-2"><h4 className="min-w-0 flex-1 text-sm font-semibold">{t('addIngredient')}</h4><Button variant="ghost" icon aria-label={t('close')} onClick={onClose}><X size={18}/></Button></div>
    <div className="relative"><Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 size-4 text-fg-secondary"/><input ref={input} className="input min-h-11 w-full ps-10" aria-label={t('labSearchIngredient')} placeholder={t('labSearchIngredient')} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (query) setQuery(''); else onClose(); }
      if (event.key === 'Enter') { event.preventDefault(); if (raw[0]) onPickBrut(raw[0]); else if (preps[0]) onPickPrep(preps[0]); }
    }}/></div>
    <button type="button" aria-expanded={helpOpen} onClick={() => setHelpOpen(value=>!value)} className="flex min-h-11 items-center gap-2 text-start text-sm text-fg-secondary"><Info size={16}/>{t('itemRecipeChooseSource')}</button>
    {helpOpen && <div className="space-y-4 rounded-r-md bg-[var(--surface-2)] p-4 text-sm">{types.map(type=><div key={type.kind}><p className="mb-1 flex items-center gap-2 font-semibold"><type.Icon size={16}/>{type.name}</p><p className="text-fg-secondary">{type.hint}</p><p className="mt-1 text-fg-secondary">{type.examples}</p></div>)}<p className="border-t border-[var(--line)] pt-3 text-fg-secondary">{t('itemRecipeNestedPrep')}</p></div>}
    {!needle && <p className="text-sm text-fg-secondary">{t('itemRecipeSearchHint')}</p>}
    {!!needle && <div className="space-y-2"><p role="status" className="text-sm text-fg-secondary">{total ? t('itemRecipeResults').replace('{count}',String(total)) : t('noResults')}</p>
      {raw.map(item=><button key={`raw-${item.id}`} type="button" onClick={()=>onPickBrut(item)} className="flex min-h-16 w-full items-start gap-3 rounded-r-md border border-[var(--line)] p-3 text-start hover:bg-[var(--surface-2)]"><Package className="mt-1 size-4 shrink-0 text-fg-secondary"/><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-fg-secondary">{t('itemRecipeRaw')} · {item.cost_per_unit>0?`${money(item.cost_per_unit)}/${item.unit} · `:''}{t(item.quantity>0?'itemRecipeStockPresent':'itemRecipeStockEmpty')}</span></span></button>)}
      {preps.map(item=><button key={`prep-${item.id}`} type="button" onClick={()=>onPickPrep(item)} className="flex min-h-16 w-full items-start gap-3 rounded-r-md border border-[var(--line)] p-3 text-start hover:bg-[var(--surface-2)]"><FlaskConical className="mt-1 size-4 shrink-0 text-fg-secondary"/><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-fg-secondary">{t('preparation')} · {item.yield_per_batch>0?t('itemRecipeBatchYield').replace('{quantity}',String(item.yield_per_batch)).replace('{unit}',item.unit):item.unit}</span></span></button>)}
    </div>}
    {!!needle && <div className="space-y-2 border-t border-[var(--line)] pt-4">{types.map(type=><button key={type.kind} type="button" onClick={()=>type.kind==='brut'?onCreateBrut(query.trim()):onCreatePrep(query.trim())} className="flex min-h-16 w-full items-start gap-3 rounded-r-md border border-[var(--line)] p-3 text-start hover:bg-[var(--surface-2)]"><type.Icon className="mt-1 size-4 shrink-0 text-fg-secondary"/><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{t('create')} · {type.name} « {query.trim()} »</span><span className="mt-1 block text-sm text-fg-secondary">{type.hint}</span></span><ChevronRight className="mt-1 size-4 shrink-0 rtl:rotate-180"/></button>)}</div>}
  </fieldset>;
}
