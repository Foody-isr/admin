'use client';

import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowLeft, Check, ChevronRight, Folder, Minus, Search, X } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

export interface ListFilterDefinition {
  id: string;
  label: string;
  options: { value: string; label: string; description?: string }[];
  selected: Set<string>;
  single?: boolean;
}

interface CustomListFilter {
  id: string;
  label: string;
  summary: string;
  content: ReactNode;
  onReset: () => void;
}

/** Rectangular quick-filter trigger matching the list toolbar controls. */
export function ListFilterButton({ label, value, icon, onClick, disabled }: { disabled?: boolean; label: string; value?: ReactNode; icon?: ReactNode; onClick: () => void }) {
  return <button type="button" className="list-filter-button" disabled={disabled} onClick={onClick}>{icon}<span className={value ? 'text-[var(--fg-muted)]' : undefined}>{label}</span>{value && <strong className="max-w-36 truncate font-semibold">{value}</strong>}</button>;
}

/** Immediate status filter with keyboard-operable multi-select options. Empty means all. */
export function ListStateFilter({ label, options, selected, onChange, disabled }: Omit<ListFilterDefinition, 'id'> & { disabled?: boolean; onChange: (values: Set<string>) => void }) {
  const { t, direction } = useI18n();
  const all = selected.size === 0 || options.every(option => selected.has(option.value));
  const selectedLabels = options.filter(option => selected.has(option.value)).map(option => option.label);
  const toggle = (value: string) => {
    const next = all ? new Set(options.map(option => option.value)) : new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    // Keep at least one status selected; empty is the explicit "all" convention.
    if (next.size) onChange(next);
  };
  return <Dropdown.Root dir={direction}>
    <Dropdown.Trigger asChild><button type="button" disabled={disabled} className="list-filter-button"><span className="text-[var(--fg-muted)]">{label}</span><strong className="font-semibold">{all ? t('all') : selectedLabels.length === 1 ? selectedLabels[0] : selectedLabels.length}</strong></button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="start" sideOffset={8} className="list-popover z-[60] min-w-52" aria-label={label}>
      <Dropdown.CheckboxItem checked={all ? true : 'indeterminate'} onSelect={event => event.preventDefault()} onCheckedChange={() => onChange(new Set())} className="list-check-option">
        <span>{t(label === t('listState') ? 'allStatuses' : 'all')}</span><span className={`list-check-box ${all ? 'is-checked' : ''}`}>{all ? <Check /> : <Minus />}</span>
      </Dropdown.CheckboxItem>
      {options.map(option => <Dropdown.CheckboxItem key={option.value} checked={all || selected.has(option.value)} onSelect={event => event.preventDefault()} onCheckedChange={() => toggle(option.value)} className="list-check-option">
        <span>{option.label}</span><span className={`list-check-box ${all || selected.has(option.value) ? 'is-checked' : ''}`}>{(all || selected.has(option.value)) && <Check />}</span>
      </Dropdown.CheckboxItem>)}
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}

/** Exclusive quick filter for list views whose server accepts one value. */
export function ListChoiceFilter({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const { direction } = useI18n();
  return <Dropdown.Root dir={direction}><Dropdown.Trigger asChild><button type="button" className="list-filter-button"><span className="text-[var(--fg-muted)]">{label}</span><strong className="font-semibold">{options.find(option => option.value === value)?.label}</strong></button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="start" sideOffset={8} className="list-popover z-[60] min-w-52" aria-label={label}>
      <Dropdown.RadioGroup value={value} onValueChange={onChange}>{options.map(option => <Dropdown.RadioItem key={option.value} value={option.value} className="list-check-option"><span>{option.label}</span><span className={`list-check-box ${value === option.value ? 'is-checked' : ''}`}>{value === option.value && <Check />}</span></Dropdown.RadioItem>)}</Dropdown.RadioGroup>
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}

/** Nested filters keep a draft until Apply; closing never changes the visible list. */
export function ListFiltersDrawer({ open, initialView = 'index', filters, customFilters = [], onClose, onApply }: {
  open: boolean;
  initialView?: string;
  filters: ListFilterDefinition[];
  customFilters?: CustomListFilter[];
  onClose: () => void;
  onApply: (values: Record<string, Set<string>>) => void;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    if (open) { setView(initialView); setSearch(''); setDraft(Object.fromEntries(filters.map(filter => [filter.id, new Set(filter.selected)]))); }
    // Opening captures one draft. Parent renders must not replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialView]);
  const current = filters.find(filter => filter.id === view);
  const custom = customFilters.find(filter => filter.id === view);
  const nested = !!current || !!custom;
  const title = current?.label ?? custom?.label ?? t('filterBy');
  const reset = () => {
    if (custom) custom.onReset();
    else {
      setDraft(previous => current ? { ...previous, [current.id]: new Set() } : Object.fromEntries(filters.map(filter => [filter.id, new Set()])));
      if (!current) customFilters.forEach(filter => filter.onReset());
    }
  };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
    <Dialog.Content {...focus} aria-describedby={undefined} dir={direction} className="list-filter-drawer fixed inset-y-0 end-0 z-50 flex w-[464px] max-w-full flex-col bg-[var(--surface)] text-[var(--fg)] shadow-3 outline-none">
      <div className="flex shrink-0 items-center justify-between gap-2 px-8 pb-9 pt-8">
        <Button type="button" variant="ghost" icon className="bg-[var(--surface-2)]" aria-label={t(nested ? 'back' : 'close')} onClick={() => { if (nested) { setView('index'); setSearch(''); } else onClose(); }}>{nested ? <ArrowLeft className="rtl:rotate-180" /> : <X />}</Button>
        <div className="flex items-center gap-2"><Button type="button" variant="ghost" className="bg-[var(--surface-2)]" onClick={reset}><span className="sm:hidden">{t('reset')}</span><span className="hidden sm:inline">{t(nested ? 'reset' : 'resetAllFilters')}</span></Button><Button type="button" onClick={() => { onApply(draft); onClose(); }}>{t('apply')}</Button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {nested && <p className="mb-2 text-sm text-[var(--fg-muted)]">{t('filterBy')}</p>}
        <Dialog.Title className="mb-7 text-2xl font-bold tracking-[-0.02em]">{title}</Dialog.Title>
        {!nested ? <div>{filters.map(filter => <button key={filter.id} type="button" className="flex min-h-20 w-full items-center justify-between gap-4 border-b border-[var(--line)] py-5 text-start" onClick={() => { setView(filter.id); setSearch(''); }}>
          <span className="min-w-0"><span className="block text-base font-semibold">{filter.label}</span><span className="mt-1 block text-sm text-[var(--fg-muted)]">{draft[filter.id]?.size ? filter.options.filter(option => draft[filter.id].has(option.value)).map(option => option.label).join(', ') : t('all')}</span></span><ChevronRight className="size-5 shrink-0 text-[var(--fg-subtle)] rtl:rotate-180" />
        </button>)}{customFilters.map(filter => <button key={filter.id} type="button" className="flex min-h-20 w-full items-center justify-between gap-4 border-b border-[var(--line)] py-5 text-start" onClick={() => setView(filter.id)}><span><span className="block text-base font-semibold">{filter.label}</span><span className="mt-1 block text-sm text-[var(--fg-muted)]">{filter.summary}</span></span><ChevronRight className="size-5 rtl:rotate-180" /></button>)}</div> : custom ? custom.content : current ? <>
          <div className="relative mb-6"><Search className="absolute start-5 top-1/2 size-5 -translate-y-1/2" aria-hidden /><input type="search" className="list-search-input" aria-label={t('search')} placeholder={t(current.id === 'category' ? 'searchCategories' : 'search')} value={search} onChange={event => setSearch(event.target.value)} /></div>
          {current.options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(option => <label key={option.value} className="flex min-h-20 cursor-pointer items-center gap-3 border-b border-[var(--line)] py-4">
            {current.id === 'category' && <span className="grid size-10 shrink-0 place-items-center rounded bg-[var(--surface-2)] text-[var(--fg-subtle)]"><Folder className="size-6" /></span>}
            <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{option.label}</span>{option.description && <span className="mt-1 block text-sm text-[var(--fg-muted)]">{option.description}</span>}</span>
            <input type={current.single ? "radio" : "checkbox"} name={current.single ? `list-filter-${current.id}` : undefined} className="size-5 shrink-0 accent-[var(--action)]" checked={draft[current.id]?.has(option.value) ?? false} onChange={event => setDraft(previous => { const next = current.single ? new Set<string>() : new Set(previous[current.id]); if (event.target.checked) next.add(option.value); else next.delete(option.value); return { ...previous, [current.id]: next }; })} />
          </label>)}
          {!current.options.some(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p className="py-8 text-center text-sm text-[var(--fg-muted)]">{t('listNoMatches')}</p>}
        </> : null}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
