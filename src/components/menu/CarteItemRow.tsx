'use client';

import { useRef, useState } from 'react';
import { GripVertical, MoreHorizontal, Image as ImageIcon } from 'lucide-react';
import { useCurrency, useI18n } from '@/lib/i18n';
import { type Menu, type MenuItem } from '@/lib/api';
import { AvailabilityPill } from './AvailabilityPill';
import { ConfirmDialog } from '@/components/ds';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export const CARTE_ITEM_COLUMNS = 'xl:grid xl:grid-cols-[44px_minmax(180px,2fr)_minmax(100px,1fr)_100px_minmax(100px,1fr)_140px_80px_44px] xl:items-center xl:gap-3';

/** Responsive catalogue row with persistent selection and scoped removal actions. */
export function CarteItemRow({ item, restaurantName, menu, onOpen, onRemove, onToggleSoldOut, isSelected, onToggleSelected, canEdit, busy, isDragging, onItemDragStart, onItemDragOver, onItemDrop, onItemDragEnd, onMoveUp, onMoveDown }: {
  item: MenuItem; restaurantName?: string; menu: Menu; onOpen: () => void; onRemove: () => void; onToggleSoldOut: () => Promise<void>;
  isSelected: boolean; onToggleSelected: () => void; canEdit: boolean; busy: boolean; isDragging: boolean;
  onItemDragStart: (e: React.DragEvent<HTMLElement>) => void; onItemDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onItemDrop: (e: React.DragEvent<HTMLElement>) => void; onItemDragEnd: () => void; onMoveUp?: () => void; onMoveDown?: () => void;
}) {
  const { t, direction } = useI18n();
  const { money } = useCurrency();
  const trigger = useRef<HTMLButtonElement>(null);
  const [remove, setRemove] = useState(false);
  const modifierNames = (item.modifier_sets ?? []).map(set => set.name).join(', ') || '—';
  const channels = [menu.pos_enabled ? t('posSystem') : '', menu.web_enabled ? 'Web' : ''].filter(Boolean).join(' · ') || t('noChannels');
  return <><article aria-label={item.name} draggable={canEdit && !busy} onDragStart={onItemDragStart} onDragOver={onItemDragOver} onDrop={onItemDrop} onDragEnd={onItemDragEnd}
    className={`relative flex flex-col gap-3 border-b border-[var(--line)] p-4 ${CARTE_ITEM_COLUMNS} ${isSelected ? 'bg-[var(--summary-bg)]' : 'hover:bg-[var(--surface-2)]'} ${isDragging ? 'opacity-40' : ''}`}>
    <div className="flex h-11 items-center gap-2 xl:h-auto">{canEdit && <><GripVertical aria-hidden className="hidden size-4 shrink-0 cursor-grab text-fg-secondary xl:block" /><label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`${t('selectItem')} · ${item.name}`} checked={isSelected} disabled={busy} onChange={onToggleSelected} className="size-5 accent-[var(--brand-500)]" /><span className="text-sm text-fg-secondary xl:sr-only">{t('select')}</span></label></>}</div>
    <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-start hover:underline">
      {item.image_url ? <img src={item.image_url} alt="" className="size-10 shrink-0 rounded-r-md object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-fg-secondary"><ImageIcon className="size-5" /></span>}
      <span className="min-w-0 break-words text-sm font-semibold" dir="auto">{item.name}</span>
    </button>
    <div className="flex min-w-0 items-center justify-between gap-3 xl:block"><span className="text-sm text-fg-secondary xl:hidden">{t('pointOfSale')}</span><span className="break-words text-end text-sm text-fg-secondary xl:text-start">{restaurantName || '—'}</span></div>
    <div className="flex min-w-0 items-center justify-between gap-3 xl:block"><span className="text-sm text-fg-secondary xl:hidden">{t('salesChannels')}</span><span className="break-words text-end text-sm text-fg-secondary xl:text-start">{channels}</span></div>
    <div className="flex min-w-0 items-center justify-between gap-3 xl:block"><span className="text-sm text-fg-secondary xl:hidden">{t('modifiers')}</span><span className="break-words text-end text-sm text-fg-secondary xl:text-start">{modifierNames}</span></div>
    <div className="flex items-center justify-between gap-3 xl:block"><span className="text-sm text-fg-secondary xl:hidden">{t('availability')}</span><AvailabilityPill state={item.availability_state} override={item.availability_override} isActive={item.is_active} bottleneck={item.availability_bottleneck} canEdit={canEdit} pending={busy} onToggle={() => void onToggleSoldOut()} /></div>
    <div className="flex items-center justify-between gap-3 xl:block xl:text-end"><span className="text-sm text-fg-secondary xl:hidden">{t('price')}</span><bdi className="text-sm font-semibold tabular-nums">{money(item.price)}</bdi></div>
    {canEdit && <DropdownMenu dir={direction}><DropdownMenuTrigger asChild><button ref={trigger} type="button" disabled={busy} aria-label={`${t('actions')} · ${item.name}`} className="absolute end-4 top-4 grid size-11 place-items-center rounded-r-md border border-[var(--line)] hover:bg-[var(--surface-2)] xl:static"><MoreHorizontal className="size-5" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] min-w-60 [&_[role=menuitem]]:min-h-11">
        <DropdownMenuItem onSelect={onOpen}>{t('editItemDetails')}</DropdownMenuItem>
        <DropdownMenuItem disabled={!onMoveUp} onSelect={onMoveUp}>{t('moveUp')}</DropdownMenuItem><DropdownMenuItem disabled={!onMoveDown} onSelect={onMoveDown}>{t('moveDown')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {['duplicateItem', 'changeModifiers', 'archiveItem'].map(key => <DropdownMenuItem key={key} disabled>{t(key)} · {t('comingSoon')}</DropdownMenuItem>)}
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setRemove(true)}>{t('carteRemoveFromGroup')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>}
  </article><ConfirmDialog returnFocusRef={trigger} open={remove} onOpenChange={setRemove} title={t('carteRemoveFromGroup')} description={`${t('removeFromGroupConfirm')} ${item.name}`} danger confirmLabel={t('carteRemoveFromGroup')} cancelLabel={t('cancel')} onConfirm={onRemove} /></>;
}
