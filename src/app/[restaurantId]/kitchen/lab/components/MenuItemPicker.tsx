'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { SearchIcon } from 'lucide-react';
import { listAllItems, type MenuItem } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

/**
 * MenuItemPicker — modal that lets the user pick one or more menu items
 * from the restaurant's global item catalog to seed a recipe-lab generation.
 */
export function MenuItemPicker({
  restaurantId,
  onPick,
  onClose,
  selectionMode = 'multiple',
  title,
  description,
}: {
  restaurantId: number;
  onPick: (ids: number[]) => void;
  onClose: () => void;
  selectionMode?: 'single' | 'multiple';
  title?: string;
  description?: string;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const field = useRef<HTMLInputElement>(null);
  const request = useRef({value:0});
  const [error,setError] = useState<string|null>(null);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const fetchItems = useCallback(async () => {
    const sequence=++request.current.value;setLoading(true);setError(null);
    try {const data=await listAllItems(restaurantId);if(sequence===request.current.value)setItems(data);}
    catch(cause){if(sequence===request.current.value)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(sequence===request.current.value)setLoading(false);}
  },[restaurantId]);
  useEffect(()=>{const scope=request.current;void fetchItems();return()=>{scope.value+=1;};},[fetchItems]);

  const toggleItem = (id: number) => {
    setSelected((prev) => {
      if (selectionMode === 'single') return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size > 0) onPick(Array.from(selected));
  };

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = normalizedSearch
    ? items.filter((item) => item.name.toLocaleLowerCase().includes(normalizedSearch))
    : items;

  return <Modal title={title ?? t('labPickItems')} subtitle={description} onClose={onClose} size="xl" initialFocusRef={field} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button onClick={handleConfirm} disabled={loading || !!error || selected.size===0}>{selectionMode==='single'?t('labOpenRecipeSheet'):t('labConfirm')} {selectionMode==='multiple' && selected.size>0?`(${selected.size})`:''}</Button></div>}>
        {/* List */}
        <div className="border-b border-[var(--line)] px-5 py-3 sm:px-6">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input
              ref={field}
              aria-label={t('labSearchMenuItem')}
              dir="auto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('labSearchMenuItem')}
              className="h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 text-base text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] sm:h-11 sm:text-sm"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void fetchItems()}>{t('retry')}</Button></div> : loading ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labLoading')}</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labPickerEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-3 transition-colors ${selected.has(item.id) ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_7%,var(--surface))]' : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-2)]'}`}>
                    <input
                      type={selectionMode === 'single' ? 'radio' : 'checkbox'}
                      name={selectionMode === 'single' ? 'lab-menu-item' : undefined}
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 accent-[var(--brand-500)] cursor-pointer"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-[var(--fg)]">{item.name}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-[var(--fg-muted)]">{money(item.price)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

    </Modal>;
}
