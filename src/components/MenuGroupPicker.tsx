'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, X, Search, Folder } from 'lucide-react';
import type { Menu } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

interface Props {
  appearance?: 'default' | 'item-editor';
  menus: Menu[];
  selectedGroupIds: Set<number>;
  onChange: (next: Set<number>) => void;
  placeholder?: string;
  emptyLabel?: string;
  noGroupsHint?: string;
  disabled?: boolean;
}

/** Selects exact display groups; changes remain in the parent item draft. */
export default function MenuGroupPicker({ menus, selectedGroupIds, onChange, placeholder, emptyLabel, noGroupsHint, disabled = false, appearance = 'default' }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const chips = menus.flatMap(menu => menu.groups ?? []).filter(group => selectedGroupIds.has(group.id));
  const visibleMenus = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return menus.map(menu => ({ ...menu, groups: (menu.groups ?? []).filter(group => menu.name.toLocaleLowerCase().includes(query) || group.name.toLocaleLowerCase().includes(query)) }))
      .filter(menu => menu.groups.length || menu.name.toLocaleLowerCase().includes(query));
  }, [menus, search]);
  const toggle = (id: number) => {
    if (disabled) return;
    const next = new Set(selectedGroupIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  if (!menus.length) return <p className="text-sm text-fg-secondary">{emptyLabel ?? t('noMenusAvailable')}</p>;
  return <div className="min-w-0 space-y-2">
    {appearance === 'item-editor' ? <>
      <button type="button" disabled={disabled} aria-label={placeholder ?? t('addToMenus')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="item-menu-picker-trigger"><Search size={20} /><span>{placeholder ?? t('addToMenus')}</span></button>
      {chips.map(group => <div key={group.id} className="item-menu-group"><Folder aria-hidden /><div className="item-menu-group-text"><strong dir="auto">{group.name}</strong><small dir="auto">{menus.find(menu => menu.groups?.some(candidate => candidate.id === group.id))?.name}</small></div><Button type="button" variant="ghost" icon disabled={disabled} aria-label={`${t('remove')} · ${group.name}`} onClick={() => toggle(group.id)}><X /></Button></div>)}
    </> : <>
      <button type="button" disabled={disabled} aria-label={placeholder ?? t('addToMenus')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="input flex min-h-11 w-full items-center justify-between gap-3 text-start text-sm"><span>{placeholder ?? t('addToMenus')}</span><ChevronDown className="size-4 shrink-0" /></button>
      {!!chips.length && <div className="flex flex-wrap gap-2">{chips.map(group => <span key={group.id} className="inline-flex max-w-full items-center gap-1 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] ps-3 text-sm"><span className="min-w-0 break-words" dir="auto">{group.name}</span><Button type="button" variant="ghost" icon disabled={disabled} aria-label={`${t('remove')} · ${group.name}`} onClick={() => toggle(group.id)}><X /></Button></span>)}</div>}
    </>}
    {open && <Modal title={placeholder ?? t('addToMenus')} subtitle={t('itemGroupDraftHint')} initialFocusRef={searchRef} onClose={() => setOpen(false)} footer={<Button type="button" variant="primary" onClick={() => setOpen(false)}>{t('done')}</Button>}>
      <label className="mb-4 block"><span className="sr-only">{t('search')}</span><input ref={searchRef} className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} /></label>
      <div className="space-y-5">{visibleMenus.map(menu => <section key={menu.id}><h3 className="mb-2 break-words text-sm font-semibold">{menu.name}</h3>{menu.groups.length ? menu.groups.map(group => <label key={group.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-[var(--line)] p-3 text-sm hover:bg-[var(--surface-2)]"><input type="checkbox" disabled={disabled} checked={selectedGroupIds.has(group.id)} onChange={() => toggle(group.id)} className="size-5 shrink-0 accent-[var(--brand-500)]" /><span className="min-w-0 break-words" dir="auto">{group.name}</span></label>) : <p className="text-sm text-fg-secondary">{noGroupsHint ?? t('noGroupsInMenu')}</p>}</section>)}{!visibleMenus.length && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}</div>
    </Modal>}
  </div>;
}
