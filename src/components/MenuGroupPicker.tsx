'use client';

import { useEffect, useRef, useState } from 'react';
import { Folder, Plus, Search, X } from 'lucide-react';
import { getBatchFulfillmentConfig, getCarteDraft, type BatchCycleSummary, type CarteDraftState, type Menu } from '@/lib/api';
import { itemMenuScope, type ItemMenuAssignment } from '@/lib/item-menu-assignments';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

interface Props {
  restaurantId: number;
  itemId?: number;
  menus: Menu[];
  assignments: ItemMenuAssignment[];
  onChange: (next: ItemMenuAssignment[]) => void;
  disabled?: boolean;
  preserveRemovals?: boolean;
}
type DraftEntry = { state?: CarteDraftState; loading: boolean; error?: boolean };

/** Stages memberships and new groups locally until the parent article is saved. */
export default function MenuGroupPicker({ restaurantId, itemId, menus, assignments, onChange, disabled = false, preserveRemovals = false }: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [cycles, setCycles] = useState<BatchCycleSummary[] | null>(null);
  const [batchError, setBatchError] = useState(false);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [entries, setEntries] = useState<Record<string, DraftEntry>>({});
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('');
  const [createError, setCreateError] = useState(false);
  const defaultDate = cycles?.[0]?.fulfillment_days?.[0]?.date;
  const dateFor = (menu: Menu) => menu.is_weekly_rotating
    ? dates[menu.id] ?? assignments.find(edit => edit.menuId === menu.id)?.seriesKey ?? defaultDate
    : '';

  useEffect(() => {
    if (!menus.some(menu => menu.is_weekly_rotating)) return;
    let active = true;
    setBatchError(false);
    getBatchFulfillmentConfig(restaurantId).then(value => {
      if (active) setCycles(value.upcoming_cycles ?? []);
    }).catch(() => { if (active) setBatchError(true); });
    return () => { active = false; };
  }, [restaurantId, menus, retry]);

  // Each series has a separate cache entry; changing it never loses staged choices.
  const scopes = JSON.stringify(menus.map(menu => ({ menuId: menu.id, date: dateFor(menu) })));
  useEffect(() => {
    let active = true;
    const targets = JSON.parse(scopes) as { menuId: number; date?: string }[];
    for (const { menuId, date } of targets) {
      if (date == null) continue;
      const scope = itemMenuScope(menuId, date);
      setEntries(current => ({ ...current, [scope]: { ...current[scope], loading: true, error: false } }));
      getCarteDraft(restaurantId, menuId, date).then(state => {
        if (state.menu_id !== menuId || state.series_key !== date) throw new Error('scope');
        if (active) setEntries(current => ({ ...current, [scope]: { state, loading: false } }));
      }).catch(() => {
        if (active) setEntries(current => ({ ...current, [scope]: { loading: false, error: true } }));
      });
    }
    return () => { active = false; };
  }, [restaurantId, scopes, retry]);

  const groupsFor = (menu: Menu) => {
    const seriesKey = dateFor(menu);
    if (seriesKey == null) return [];
    const entry = entries[itemMenuScope(menu.id, seriesKey)];
    const edits = assignments.filter(edit => edit.menuId === menu.id && edit.seriesKey === seriesKey);
    const groups = (entry?.state?.payload.groups ?? []).map(group => ({
      key: group.key, name: group.name,
      selected: edits.find(edit => edit.groupKey === group.key)?.selected ?? (!!itemId && group.item_ids.includes(itemId)),
      original: !!itemId && group.item_ids.includes(itemId), create: false,
    }));
    for (const edit of edits) {
      if (edit.create && edit.selected && !groups.some(group => group.key === edit.groupKey)) {
        groups.push({ key: edit.groupKey, name: edit.groupName, selected: true, original: false, create: true });
      }
    }
    return groups;
  };
  const toggle = (menu: Menu, group: ReturnType<typeof groupsFor>[number]) => {
    if (disabled) return;
    const seriesKey = dateFor(menu)!;
    const previous = assignments.find(edit => edit.menuId === menu.id && edit.seriesKey === seriesKey && edit.groupKey === group.key);
    const rest = assignments.filter(edit => !(edit.menuId === menu.id && edit.seriesKey === seriesKey && edit.groupKey === group.key));
    const selected = !group.selected;
    if (preserveRemovals || selected !== group.original) rest.push({ menuId: menu.id, seriesKey, groupKey: group.key, groupName: group.name, selected, ...(group.create || previous?.create ? { create: true } : {}) });
    onChange(rest);
  };
  const create = (menu: Menu) => {
    if (disabled) return;
    const name = groupName.trim();
    if (!name || groupsFor(menu).some(group => group.name.trim().toLowerCase() === name.toLowerCase())) { setCreateError(true); return; }
    onChange([...assignments, { menuId: menu.id, seriesKey: dateFor(menu)!, groupKey: crypto.randomUUID(), groupName: name, selected: true, create: true }]);
    setCreating(null); setGroupName(''); setCreateError(false);
  };
  const chips = menus.flatMap(menu => groupsFor(menu).filter(group => group.selected).map(group => ({ menu, group, date: dateFor(menu)! })));
  const otherChoices = assignments.filter(edit => edit.selected && !chips.some(chip => chip.menu.id === edit.menuId && chip.date === edit.seriesKey && chip.group.key === edit.groupKey));
  const query = search.trim().toLowerCase();
  if (!menus.length) return <p className="text-sm text-fg-secondary">{t('noMenusAvailable')}</p>;
  return <div className="min-w-0 space-y-2">
    <button type="button" disabled={disabled} aria-label={t('addToMenus')} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); setRetry(value => value + 1); }} className="item-menu-picker-trigger">
      <Search size={20} /><span>{t('addToMenus')}</span>
    </button>
    {chips.map(({ menu, group, date }) => <div key={`${menu.id}:${date}:${group.key}`} className="item-menu-group">
      <Folder aria-hidden /><div className="item-menu-group-text"><strong dir="auto">{group.name}</strong><small dir="auto">{menu.name}{date ? ` · ${date}` : ''}</small></div>
      <Button type="button" variant="ghost" icon disabled={disabled} aria-label={`${t('remove')} · ${group.name}`} onClick={() => toggle(menu, group)}><X /></Button>
    </div>)}
    {otherChoices.map(edit => <div key={`${edit.menuId}:${edit.seriesKey}:${edit.groupKey}`} className="item-menu-group">
      <Folder aria-hidden /><div className="item-menu-group-text"><strong dir="auto">{edit.groupName}</strong><small dir="auto">{menus.find(menu => menu.id === edit.menuId)?.name} · {edit.seriesKey}</small></div>
      <Button type="button" variant="ghost" icon disabled={disabled} aria-label={`${t('remove')} · ${edit.groupName}`} onClick={() => onChange(preserveRemovals ? assignments.map(value => value === edit ? { ...value, selected: false } : value) : assignments.filter(value => value !== edit))}><X /></Button>
    </div>)}
    <p className="text-sm text-fg-secondary">{t('itemMenuDraftHint')}</p>
    {open && <Modal title={t('addToMenus')} subtitle={t('itemMenuDraftHint')} initialFocusRef={searchRef} onClose={() => { setOpen(false); setCreating(null); }} footer={<Button type="button" variant="primary" onClick={() => { setOpen(false); setCreating(null); }}>{t('done')}</Button>}>
      <label className="mb-4 block"><span className="sr-only">{t('search')}</span><input ref={searchRef} className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} /></label>
      <div className="space-y-5">{menus.map(menu => {
        const date = dateFor(menu);
        const entry = date == null ? undefined : entries[itemMenuScope(menu.id, date)];
        const allGroups = groupsFor(menu);
        const visible = allGroups.filter(group => menu.name.toLowerCase().includes(query) || group.name.toLowerCase().includes(query));
        if (query && !menu.name.toLowerCase().includes(query) && !visible.length) return null;
        return <section key={menu.id} aria-label={menu.name}>
          <h3 className="mb-2 break-words text-sm font-semibold" dir="auto">{menu.name}</h3>
          {menu.is_weekly_rotating && cycles && <label className="mb-3 block"><span className="text-sm">{t('selectBatch')}</span><select className="input mt-1" aria-label={`${t('selectBatch')} · ${menu.name}`} value={date ?? ''} disabled={disabled} onChange={event => { setDates(current => ({ ...current, [menu.id]: event.target.value })); setCreating(null); }}>
            {date && !cycles.some(cycle => cycle.fulfillment_days?.[0]?.date === date) && <option value={date}>{date}</option>}
            {cycles.filter(cycle => cycle.fulfillment_days?.[0]?.date).map(cycle => { const day = cycle.fulfillment_days[0].date; return <option key={day} value={day}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${day}T12:00:00`))}</option>; })}
          </select></label>}
          {(entry?.error || (menu.is_weekly_rotating && batchError)) ? <div role="alert" className="space-y-2 text-sm"><p>{t('itemMenuDraftLoadFailed')}</p><Button type="button" onClick={() => setRetry(value => value + 1)}>{t('retry')}</Button></div>
            : date == null && cycles ? <p role="alert" className="text-sm">{t('carteBatchRequired')}</p>
            : !entry || entry.loading ? <p role="status" className="text-sm">{t('loading')}</p>
            : <>
              {visible.map(group => <label key={group.key} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-[var(--line)] p-3 text-sm hover:bg-[var(--surface-2)] selection-row">
                <input type="checkbox" disabled={disabled} checked={group.selected} onChange={() => toggle(menu, group)} className="size-5 shrink-0 accent-[var(--brand-500)]" /><span className="min-w-0 break-words" dir="auto">{group.name}{group.create && <small className="block text-fg-secondary">{t('itemMenuGroupPending')}</small>}</span>
              </label>)}
              {!allGroups.length && <p className="text-sm text-fg-secondary">{t('noGroupsInMenu')}</p>}
              {creating === menu.id ? <div className="mt-3 space-y-3 rounded-r-md border border-[var(--line)] p-3">
                <label className="block text-sm">{t('groupName')}<input autoFocus disabled={disabled} className="input mt-1" maxLength={255} value={groupName} onChange={event => { setGroupName(event.target.value); setCreateError(false); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create(menu); } }} /></label>
                {createError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('itemMenuGroupNameInvalid')}</p>}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="primary" disabled={disabled || !groupName.trim()} onClick={() => create(menu)}>{t('createGroup')}</Button><Button type="button" onClick={() => setCreating(null)}>{t('cancel')}</Button></div>
              </div> : <Button type="button" className="mt-3" disabled={disabled} onClick={() => { setCreating(menu.id); setGroupName(''); setCreateError(false); }}><Plus aria-hidden size={16} />{t('createGroup')}</Button>}
            </>}
        </section>;
      })}{query && !menus.some(menu => menu.name.toLowerCase().includes(query) || groupsFor(menu).some(group => group.name.toLowerCase().includes(query))) && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}</div>
    </Modal>}
  </div>;
}
