"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Package, Check, Link2 } from 'lucide-react';
import { linkSaleToLibrary, type SalesLinkContext, type SalesLinkStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { matchesSalesLibraryItem } from '@/lib/sales-library';
import { KitchenDrawer, KitchenSearch, KitchenPagination } from './KitchenDrawer';
import styles from './companion.module.css';

/** Explicit source-to-library confirmation shared by all imported product names. */
export function SalesLinkEditor({ restaurantId, reportId, sale, context, onSaved, onClose }: {
  restaurantId: number; reportId: number; sale: SalesLinkStatus; context: SalesLinkContext;
  onSaved: () => Promise<void>; onClose: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(sale.menu_item_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = context.items.filter(item => matchesSalesLibraryItem(item, search));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / 8) - 1));
  const choice = context.items.find(item => item.id === selected);
  const save = async () => {
    if (!choice || busy) return;
    setBusy(true); setError('');
    try {
      await linkSaleToLibrary(restaurantId, reportId, sale.sale_id, choice.id);
      await onSaved();
      onClose();
    } catch { setError(t('salesLinkError')); }
    finally { setBusy(false); }
  };
  return <KitchenDrawer title={t('salesLinkTitle')} description={t('salesLinkDescription')} onClose={onClose} busy={busy}
    footer={<><span className="min-w-0 flex-1 text-sm"><bdi>{choice?.name ?? t('salesLinkChoose')}</bdi></span><button className={styles.primaryButton} disabled={!choice || busy} onClick={save}><Link2 size={16}/>{t(busy ? 'saving' : 'salesLinkConfirm')}</button></>}>
    <div className="mx-5 mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4"><small className="block text-[var(--fg-muted)]">{t('salesLinkSource')}</small><strong className="mt-1 block text-lg" dir="auto">{sale.source_name}</strong></div>
    <p className="mx-5 my-4 text-sm leading-6 text-[var(--fg-muted)]">{t(context.report_closed ? 'salesLinkClosedHint' : 'salesLinkOpenHint')}</p>
    <div className={styles.toolbar}><KitchenSearch value={search} label={t('salesLinkSearch')} onChange={value => {setSearch(value); setPage(0);}}/></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className="px-5" role="radiogroup" aria-label={t('salesLinkChoose')}>
      {items.slice(currentPage * 8, currentPage * 8 + 8).map(item => <button key={item.id} type="button" role="radio" aria-checked={selected === item.id} disabled={busy}
        onClick={() => setSelected(item.id)} className={`my-2 flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-start ${selected === item.id ? 'border-[var(--brand-500)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`}>
        {/^https?:\/\//.test(item.image_url) ? <Image src={item.image_url} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-lg object-cover"/> : <Package className="m-3 shrink-0 text-[var(--fg-muted)]" size={24}/>}
        <span className="min-w-0 flex-1"><strong className="block" dir="auto">{item.name}</strong><small className="block text-[var(--fg-muted)]" dir="auto">{item.category}{item.translations?.name?.he && item.translations.name.he !== item.name ? ` · ${item.translations.name.he}` : ''}</small><small className="block text-[var(--fg-muted)]">{t(item.has_recipe ? 'salesLinkWithRecipe' : 'salesLinkNoRecipe')}</small></span>
        {selected === item.id && <Check size={20} className="shrink-0"/>}
      </button>)}
    </div>
    {!items.length && <p className={styles.empty}>{t('noResults')}</p>}
    <KitchenPagination page={currentPage} count={items.length} size={8} onChange={setPage}/>
    {choice && !choice.has_recipe && <p className="mx-5 mb-5 rounded-xl bg-[var(--surface-2)] p-4 text-sm">{t('salesLinkNoRecipeHint')}</p>}
  </KitchenDrawer>;
}
