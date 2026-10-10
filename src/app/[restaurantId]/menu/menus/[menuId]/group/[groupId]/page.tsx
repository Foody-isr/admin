'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Image as ImageIcon, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { listMenus, getAllCategories, getRestaurant, getGroupHours, listGroupMemberships, createGroup, updateGroup, setGroupHours, addItemsToGroup, removeItemFromGroup, uploadGroupImage, type Menu, type MenuItem, type MenuCategory, type GroupAvailabilityHour, type MenuGroupMembership, type TranslationMap } from '@/lib/api';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { isMembershipActiveOn } from '@/lib/membership';
import { addDays, clampWeekStartDay, getEffectiveWorkdays, getWeekStart, isoDate, workdaySpan, type WeekStartDay } from '@/lib/weeks';
import { Button, FullScreenEditor, ConfirmDialog } from '@/components/ds';
import Modal from '@/components/Modal';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';
import { LocaleEditingBanner } from '@/components/i18n/LocaleEditingBanner';
import { MenuHoursEditor, menuHoursAreComplete } from '@/components/menu/MenuHoursEditor';
import { GroupSelectionDialog } from '@/components/menu/GroupSelectionDialog';
import { ReplaceItemsModal } from '@/components/menu/CarteItemDialogs';

const LOCALES: Locale[] = ['en', 'he', 'fr'];
type Draft = { name: string; translations: TranslationMap; parentId?: number; menuId: number; follows: boolean; hidden: boolean; pos: boolean; web: boolean; hours: GroupAvailabilityHour[] };

/** Keeps group details, library categories and dated memberships in their own scopes. */
export default function GroupPage() {
  const { restaurantId, menuId, groupId } = useParams();
  return <GroupEditor key={`${restaurantId}.${menuId}.${groupId}`} />;
}

function GroupEditor() {
  const params = useParams();
  const rid = Number(params.restaurantId); const mid = Number(params.menuId);
  const isNew = params.groupId === 'new'; const gid = isNew ? null : Number(params.groupId);
  const { t } = useI18n(); const { money } = useCurrency(); const router = useRouter();
  const { hasAnyPermission } = usePermissions(); const canEdit = hasAnyPermission('menu.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]); const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [memberships, setMemberships] = useState<MenuGroupMembership[]>([]);
  const [source, setSource] = useState<Locale>('en'); const [editingLocale, setEditingLocale] = useState<Locale>('en');
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1); const [workdays, setWorkdays] = useState<number[]>([0,1,2,3,4,5,6]);
  const [week, setWeek] = useState(() => isoDate(getWeekStart(new Date(), 1)));
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState(''); const [uploading, setUploading] = useState(false); const [imageError, setImageError] = useState('');
  const [pending, setPending] = useState(new Set<number>()); const [selected, setSelected] = useState(new Set<number>());
  const [picker, setPicker] = useState<'items' | 'categories' | 'replace' | null>(null);
  const [removal, setRemoval] = useState<MenuItem | null>(null); const [removeScope, setRemoveScope] = useState<'week' | 'all'>('week'); const [removeError, setRemoveError] = useState(''); const [removing, setRemoving] = useState(false);
  const [navigation, setNavigation] = useState<string | null>(null);
  const busy = useRef(false); const savedId = useRef(gid); const baseline = useRef('');
  const [persistedParent, setPersistedParent] = useState<number | undefined>();
  const guardRef = useRef(new RestaurantRequestGuard()); guardRef.current.enterRestaurant(rid);
  const form = useRef<HTMLFormElement>(null); const file = useRef<HTMLInputElement>(null);
  const replacementProgress = useRef({ removed: new Set<number>(), added: new Set<number>() });
  const dirty = !!draft && (!!pending.size || JSON.stringify(draft) !== baseline.current);
  const update = (patch: Partial<Draft>) => setDraft(current => current ? { ...current, ...patch } : current);

  const load = useCallback(async () => {
    const guard = guardRef.current; const token = guard.begin(rid); setLoading(true); setLoadError('');
    try {
      const [allMenus, allCats, restaurant] = await Promise.all([listMenus(rid), getAllCategories(rid), getRestaurant(rid)]);
      const menu = allMenus.find(value => value.id === mid);
      if (!menu) throw new Error('menuNotFound');
      const group = gid ? menu.groups?.find(value => value.id === gid) : null;
      if (gid && !group) throw new Error('groupNotFound');
      const [hours, members] = gid ? await Promise.all([getGroupHours(rid, gid), listGroupMemberships(rid, gid)]) : [[], []];
      if (!guard.isCurrent(token)) return;
      const next: Draft = { name: group?.name ?? '', translations: group?.translations ?? {}, parentId: group?.parent_id ?? undefined, menuId: mid, follows: group?.follows_menu_hours ?? true, hidden: group?.is_hidden ?? false, pos: group?.pos_enabled ?? true, web: group?.web_enabled ?? true, hours };
      const sourceLocale = LOCALES.includes(restaurant.default_locale as Locale) ? restaurant.default_locale as Locale : 'en';
      const firstDay = clampWeekStartDay(restaurant.week_start_day);
      setMenus(allMenus); setCategories(allCats); setMemberships(members); setDraft(next); baseline.current = JSON.stringify(next);
      setSource(sourceLocale); setEditingLocale(sourceLocale); setImageUrl(group?.image_url ?? ''); setPersistedParent(group?.parent_id ?? undefined);
      setWeekStartDay(firstDay); setWorkdays(getEffectiveWorkdays(restaurant)); setWeek(isoDate(getWeekStart(new Date(), firstDay)));
    } catch (cause) { if (guard.isCurrent(token)) setLoadError(cause instanceof Error ? cause.message : 'libraryOperationFailed'); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid, mid, gid]);
  useEffect(() => { const guard = guardRef.current; void load(); return () => guard.invalidate(); }, [load]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const navigate = (url: string, additionalDraft = false) => { if (busy.current) return; if (dirty || additionalDraft) setNavigation(url); else router.push(url); };
  const refreshMembers = async () => { if (gid) { const members = await listGroupMemberships(rid, gid); setMemberships(members); setSelected(new Set()); } };
  const allItems = useMemo(() => categories.flatMap(category => category.items ?? []), [categories]);
  const groupItems = useMemo(() => {
    const saved = memberships.filter(member => isMembershipActiveOn(member, week) && member.item).map(member => member.item!);
    const ids = new Set(saved.map(item => item.id));
    return [...saved, ...allItems.filter(item => pending.has(item.id) && !ids.has(item.id))];
  }, [memberships, week, allItems, pending]);
  const span = workdaySpan(new Date(week + 'T00:00:00'), workdays);
  const currentWeek = isoDate(getWeekStart(new Date(), weekStartDay));
  const isCurrentWeek = week === currentWeek;
  const addScope = isCurrentWeek ? {} : { effective_from: isoDate(span.first), effective_until: isoDate(span.last) };
  const cutoff = isoDate(addDays(new Date(week + 'T00:00:00'), -1));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !draft || busy.current) return;
    if (!draft.name.trim()) { setError(t('groupNameRequired')); setEditingLocale(source); return; }
    if (!draft.follows && !menuHoursAreComplete(draft.hours.map(hour => ({ ...hour, menu_id: mid })))) { setError(t('menuIncompleteHours')); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const input = { name: draft.name, translations: draft.translations, parent_id: draft.parentId, menu_id: draft.menuId, follows_menu_hours: draft.follows, is_hidden: draft.hidden, pos_enabled: draft.pos, web_enabled: draft.web };
      if (!savedId.current) { const group = await createGroup(rid, input); savedId.current = group.id; setPersistedParent(group.parent_id ?? undefined); }
      else await updateGroup(rid, savedId.current, input);
      if (!draft.follows) await setGroupHours(rid, savedId.current, draft.hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({ day_of_week, open_time, close_time, is_closed })));
      if (pending.size) await addItemsToGroup(rid, savedId.current, Array.from(pending));
      router.push(`/${rid}/menu/menus/${mid}`);
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : t('libraryOperationFailed')} ${savedId.current ? t('menuSavePartial') : ''}`); }
    finally { busy.current = false; setSaving(false); }
  };
  const changeImage = async (image?: File) => {
    if (!gid || !canEdit || busy.current) return;
    busy.current = true; setUploading(true); setImageError('');
    try { const url = image ? await uploadGroupImage(rid, gid, image) : ''; await updateGroup(rid, gid, { image_url: url }); setImageUrl(url); }
    catch (cause) { setImageError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setUploading(false); if (file.current) file.current.value = ''; }
  };
  const assign = async (ids: number[]) => {
    if (!canEdit || busy.current) return;
    if (!ids.length) throw new Error(t('noItemsSelected'));
    busy.current = true;
    try {
      if (isNew) setPending(previous => new Set([...Array.from(previous), ...ids]));
      else if (gid) { await addItemsToGroup(rid, gid, ids, addScope); await refreshMembers(); }
      setPicker(null);
    } finally { busy.current = false; }
  };
  const replace = async (choices: { oldId: number; newId: number }[]) => {
    if (!canEdit || busy.current) return;
    busy.current = true;
    try {
      if (isNew) setPending(previous => { const next = new Set(previous); for (const choice of choices) { next.delete(choice.oldId); next.add(choice.newId); } return next; });
      else if (gid) {
        for (const { oldId, newId } of choices) {
          if (!replacementProgress.current.removed.has(oldId)) { await removeItemFromGroup(rid, gid, oldId, isCurrentWeek ? undefined : cutoff); replacementProgress.current.removed.add(oldId); }
          if (!replacementProgress.current.added.has(newId)) { await addItemsToGroup(rid, gid, [newId], addScope); replacementProgress.current.added.add(newId); }
        }
        await refreshMembers();
      }
      setPicker(null); setSelected(new Set());
    } finally { busy.current = false; }
  };
  const remove = async () => {
    if (!removal || !canEdit || busy.current) return;
    busy.current = true; setRemoving(true); setRemoveError('');
    try { if (gid) { await removeItemFromGroup(rid, gid, removal.id, removeScope === 'week' ? cutoff : undefined); await refreshMembers(); } setRemoval(null); }
    catch (cause) { setRemoveError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setRemoving(false); }
  };
  const sourceTab = editingLocale === source;
  const setTranslatedName = (value: string) => {
    if (!draft) return;
    if (sourceTab) { update({ name: value }); return; }
    const translations = { ...draft.translations }; const names = { ...translations.name };
    if (value) names[editingLocale] = value; else delete names[editingLocale];
    if (Object.keys(names).length) translations.name = names; else delete translations.name;
    update({ translations });
  };
  const parentOptions = menus.find(menu => menu.id === mid)?.groups?.filter(group => group.id !== gid) ?? [];
  return <><FullScreenEditor open onOpenChange={open => { if (!open) navigate(`/${rid}/menu/menus/${mid}`); }} title={t(isNew ? 'createGroup' : 'groupName')} subtitle={menus.find(menu => menu.id === mid)?.name} showCancel={false}
    onSave={canEdit && draft && !loading && !loadError ? () => form.current?.requestSubmit() : undefined} saveLabel={t(saving ? 'saving' : 'save')} saveDisabled={saving || uploading}>
    {loading ? <p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p>
    : loadError ? <div role="alert" className="space-y-4 rounded-r-lg border border-[var(--line)] p-5"><p className="text-[var(--danger-500)]">{t(loadError)}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>
    : draft && <div className="mx-auto max-w-4xl space-y-6">
      <form ref={form} onSubmit={save} className="space-y-5">
        <fieldset disabled={!canEdit || saving || uploading} className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
            <LocaleTabs locales={LOCALES} source={source} active={editingLocale} onChange={setEditingLocale} missing={Object.fromEntries(LOCALES.filter(value => value !== source).map(value => [value, !draft.translations.name?.[value]]))} />
            <LocaleEditingBanner active={editingLocale} source={source} />
            <label className="block space-y-2 text-sm font-semibold"><span>{t('groupName')}</span><input className="input" dir={editingLocale === 'he' ? 'rtl' : 'ltr'} required={sourceTab} value={sourceTab ? draft.name : draft.translations.name?.[editingLocale] ?? ''} onChange={event => setTranslatedName(event.target.value)} /></label>
            {!sourceTab && <p className="text-sm text-fg-secondary">{t('languageSourceLabel')}: <bdi>{draft.name || '—'}</bdi></p>}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="block min-w-0 space-y-2 text-sm"><span className="font-semibold">{t('menus')}</span><select className="input" value={draft.menuId} onChange={event => update({ menuId: Number(event.target.value) })}>{menus.map(menu => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></label>
              <label className="block min-w-0 space-y-2 text-sm"><span className="font-semibold">{t('parentGroup')}</span><select className="input" value={draft.parentId ?? ''} onChange={event => update({ parentId: event.target.value ? Number(event.target.value) : undefined })}><option value="" disabled={persistedParent !== undefined}>{t('none')}</option>{parentOptions.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
            {persistedParent !== undefined && <p className="text-sm text-fg-secondary">{t('groupParentClearUnsupported')}</p>}
          </section>
          <section className="space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">{t('menuAndAvailability')}</h2><div className="flex flex-wrap items-center gap-5"><span className="text-sm text-fg-secondary">{t('salesChannels')}</span><label className="flex min-h-11 items-center gap-2 text-sm selection-row"><input type="checkbox" checked={draft.pos} onChange={event => update({ pos: event.target.checked })} />POS</label><label className="flex min-h-11 items-center gap-2 text-sm selection-row"><input type="checkbox" checked={draft.web} onChange={event => update({ web: event.target.checked })} />Web</label></div>
            <label className="flex min-h-11 items-center gap-3 text-sm selection-row"><input type="checkbox" checked={draft.hidden} onChange={event => update({ hidden: event.target.checked })} /><span>{t('hideOnAllChannels')}<span className="mt-1 block text-fg-secondary">{t('hideOnAllChannelsDesc')}</span></span></label>
            <label className="flex min-h-11 items-center gap-3 border-t border-[var(--line)] pt-4 text-sm selection-row"><input type="checkbox" checked={draft.follows} onChange={event => update({ follows: event.target.checked })} />{t('useExistingHours')}</label><p className="text-sm text-fg-secondary">{t('groupHoursDescription')}</p>
            {!draft.follows && <MenuHoursEditor hours={draft.hours.map(hour => ({ ...hour, menu_id: mid }))} emptyMessage={t('groupNoHours')} onChange={hours => update({ hours: hours.map(({ id, day_of_week, open_time, close_time, is_closed }) => ({ id, day_of_week, open_time, close_time, is_closed, menu_group_id: gid ?? 0 })) })} />}
          </section>
        </fieldset>
        {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{error}</p>}
      </form>
      <section className="space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">{t('image')}</h2><p className="text-sm text-fg-secondary">{t(isNew ? 'saveFirstToUpload' : 'groupImageImmediate')}</p>
        <input ref={file} type="file" accept="image/*" className="sr-only" aria-label={t('groupUploadImage')} disabled={!canEdit || isNew || saving || uploading} onChange={event => { const image = event.target.files?.[0]; if (image) void changeImage(image); }} />
        <button type="button" disabled={!canEdit || isNew || saving || uploading} aria-label={t(imageUrl ? 'changeImage' : 'groupUploadImage')} className="flex min-h-28 w-full items-center justify-center gap-3 overflow-hidden rounded-r-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-4 text-sm text-fg-secondary disabled:cursor-default" onClick={() => file.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const image = event.dataTransfer.files[0]; if (canEdit && !isNew && image?.type.startsWith('image/')) void changeImage(image); }}>
          {imageUrl ? <img src={imageUrl} alt="" className="max-h-44 rounded-r-md object-contain" /> : <ImageIcon className="size-7" />}<span>{t(uploading ? 'loading' : imageUrl ? 'changeImage' : 'groupUploadImage')}</span>
        </button>{imageUrl && canEdit && <Button type="button" variant="secondary" disabled={saving || uploading} onClick={() => void changeImage()}><Trash2 />{t('removeImage')}</Button>}{imageError && <p role="alert" className="text-sm text-[var(--danger-500)]">{imageError}</p>}
      </section>
      <section className="min-w-0 overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]"><div className="space-y-3 bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('articlesGroup')}</h2>{!isNew && <GroupWeekPicker value={week} currentWeek={currentWeek} onChange={value => { setWeek(value); setSelected(new Set()); }} />}</div><p className="text-sm">{t(isNew ? 'groupItemsOnSave' : 'groupItemsImmediate')}</p>{!isNew && !isCurrentWeek && <p className="text-sm">{t('groupWeekScopeHint').replace('{from}', isoDate(span.first)).replace('{to}', isoDate(span.last))}</p>}</div>
        {canEdit && <div className="flex flex-wrap gap-2 border-b border-[var(--line)] p-4"><Button variant="secondary" disabled={saving || uploading} onClick={() => setPicker('items')}><Plus />{t('addArticle')}</Button><Button variant="secondary" disabled={saving || uploading} onClick={() => setPicker('categories')}>{t('addFromCategory')}</Button>{selected.size > 0 && <><Button variant="secondary" onClick={() => { replacementProgress.current = { removed: new Set(), added: new Set() }; setPicker('replace'); }}>{t('replace')}</Button><Button variant="ghost" onClick={() => setSelected(new Set())}>{t('clear')}</Button></>}</div>}
        {groupItems.map(item => <article key={item.id} aria-label={item.name} className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4 last:border-0">{canEdit && <input type="checkbox" aria-label={item.name} checked={selected.has(item.id)} disabled={saving || uploading} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="size-5 shrink-0 accent-[var(--brand-500)]" />}
          {item.image_url && <img src={item.image_url} alt="" className="size-12 shrink-0 rounded-r-md object-cover" />}
          <button type="button" className="min-w-0 flex-[1_1_180px] text-start hover:underline" onClick={() => navigate(`/${rid}/menu/items/${item.id}`)}><span className="block break-words text-sm font-semibold" dir="auto">{item.name}</span><bdi className="text-sm text-fg-secondary">{money(item.price)}</bdi></button>{canEdit && <Button variant="ghost" disabled={saving || uploading} onClick={() => { if (pending.has(item.id)) { setPending(previous => { const next = new Set(previous); next.delete(item.id); return next; }); setSelected(previous => { const next = new Set(previous); next.delete(item.id); return next; }); } else { setRemoveError(''); setRemoveScope('week'); setRemoval(item); } }}>{t('carteRemoveFromGroup')}</Button>}
        </article>)}{!groupItems.length && <p className="p-8 text-center text-sm text-fg-secondary">{t('noItemsSelected')}</p>}
      </section>
    </div>}
  </FullScreenEditor>
  {(picker === 'items' || picker === 'categories') && <GroupSelectionDialog title={t(picker === 'items' ? 'addArticle' : 'addFromCategoryTitle')} choices={picker === 'items' ? allItems.filter(item => !groupItems.some(member => member.id === item.id)).map(item => ({ id: item.id, name: item.name, detail: money(item.price) })) : categories.map(category => ({ id: category.id, name: category.name, detail: t('nArticles').replace('{n}', String(category.items?.length ?? 0)), disabled: !category.items?.length }))} onClose={() => setPicker(null)} onSave={ids => assign(picker === 'items' ? ids : Array.from(new Set(categories.filter(category => ids.includes(category.id)).flatMap(category => (category.items ?? []).map(item => item.id)))))} onCreate={picker === 'items' ? changed => navigate(`/${rid}/menu/items/new`, changed) : undefined} />}
  {picker === 'replace' && <ReplaceItemsModal t={t} itemsToReplace={groupItems.filter(item => selected.has(item.id))} allItems={allItems} allCats={categories} groupItemIds={new Set(groupItems.map(item => item.id))} onClose={() => { setPicker(null); if (replacementProgress.current.removed.size || replacementProgress.current.added.size) void refreshMembers().catch(cause => setError(cause instanceof Error ? cause.message : t('libraryOperationFailed'))); }} onDone={replace} />}
  {removal && <Modal title={t('carteRemoveFromGroup')} subtitle={removal.name} onClose={() => { if (!removing) setRemoval(null); }} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={removing} onClick={() => setRemoval(null)}>{t('cancel')}</Button><Button variant="danger" disabled={removing} onClick={() => void remove()}>{t(removing ? 'saving' : 'carteRemoveFromGroup')}</Button></div>}>
    <fieldset disabled={removing} className="space-y-3"><legend className="mb-3 text-sm text-fg-secondary">{t('groupRemoveDescription')}</legend>{(['week','all'] as const).map(scope => <label key={scope} className="flex min-h-14 items-start gap-3 rounded-r-md border border-[var(--line)] p-3 text-sm selection-row"><input type="radio" name="remove-scope" checked={removeScope === scope} onChange={() => setRemoveScope(scope)} className="mt-1 size-4 shrink-0" /><span>{t(scope === 'week' ? 'groupRemoveFromWeek' : 'groupRemoveAll')}{scope === 'week' && <bdi className="mt-1 block text-fg-secondary">{week}</bdi>}</span></label>)}</fieldset>{removeError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{removeError}</p>}
  </Modal>}
  <ConfirmDialog open={navigation !== null} onOpenChange={open => { if (!open) setNavigation(null); }} title={t('discardChanges')} description={isNew && savedId.current ? t('menuSavePartial') : t('libraryDiscardDescription')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { if (navigation) router.push(navigation); }} />
  </>;
}

function GroupWeekPicker({ value, currentWeek, onChange }: { value: string; currentWeek: string; onChange: (value: string) => void }) {
  const { t, locale, direction } = useI18n();
  const options = [-1,0,1,2,3,4].map(offset => isoDate(addDays(new Date(currentWeek + 'T00:00:00'), offset * 7)));
  const label = (date: string) => { const formatted = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T00:00:00')); return date === currentWeek ? `${t('weekThis')} · ${formatted}` : formatted; };
  return <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto"><Button variant="secondary" size="lg" icon aria-label={t('weekPrev')} onClick={() => onChange(isoDate(addDays(new Date(value + 'T00:00:00'), -7)))}>{direction === 'rtl' ? <ArrowRight /> : <ArrowLeft />}</Button><select className="input min-w-0 flex-1 text-sm sm:w-56" aria-label={t('groupSelectWeek')} value={value} onChange={event => onChange(event.target.value)}>{options.map(date => <option key={date} value={date}>{label(date)}</option>)}{!options.includes(value) && <option value={value}>{label(value)}</option>}</select><Button variant="secondary" size="lg" icon aria-label={t('weekNext')} onClick={() => onChange(isoDate(addDays(new Date(value + 'T00:00:00'), 7)))}>{direction === 'rtl' ? <ArrowLeft /> : <ArrowRight />}</Button></div>;
}
