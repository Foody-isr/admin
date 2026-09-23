'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  Barcode, CircleAlert, ClipboardList, Copy, Globe2, MoreHorizontal, Pencil,
  Minus, Plus, Printer, ReceiptText, RefreshCw, Search, Settings2, Smartphone, Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {
  createPrinterProfile, deletePrinterProfile, duplicatePrinterProfile, getAllCategories,
  getPrintingCenter,
  replacePrinterProfileAssignments, updatePrinterProfile,
  type MenuCategory, type PrintAgent, type PrinterConfiguration, type PrinterProfile,
  type PrintingCenterSnapshot,
  type PrinterItemSortOrder, type PrinterProfileJobType, type PrinterTicketFontSize,
  type PrinterTicketLayout, type PrinterTicketMargins, type SavePrinterProfileInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  Button, ConfirmDialog, Drawer, EmptyState, Field, FullScreenEditor, Input,
  Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, PageHead, Section,
  Select, Tab, Table, TableShell, Tabs, TabsContent, TabsList, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import PrintingCenterPanel, { type PrintingCenterTab } from './PrintingCenterPanel';

type T = (key: string) => string;
const JOB_TYPES: Array<{ type: PrinterProfileJobType; title: string; desc: string; icon: typeof Printer }> = [
  { type: 'receipts', title: 'printerProfileJobReceipts', desc: 'printerProfileJobReceiptsDesc', icon: ReceiptText },
  { type: 'dine_in_tickets', title: 'printerProfileJobDineIn', desc: 'printerProfileJobDineInDesc', icon: UtensilsCrossed },
  { type: 'online_tickets', title: 'printerProfileJobOnline', desc: 'printerProfileJobOnlineDesc', icon: Globe2 },
  { type: 'order_stubs', title: 'printerProfileJobStubs', desc: 'printerProfileJobStubsDesc', icon: ClipboardList },
  { type: 'void_tickets', title: 'printerProfileJobVoids', desc: 'printerProfileJobVoidsDesc', icon: CircleAlert },
  { type: 'barcode_labels', title: 'printerProfileJobLabels', desc: 'printerProfileJobLabelsDesc', icon: Barcode },
];

const MARGIN_OPTIONS: Array<{ value: PrinterTicketMargins; label: string }> = [
  { value: 'none', label: 'printerProfileMarginNone' },
  { value: 'top', label: 'printerProfileMarginTop' },
  { value: 'bottom', label: 'printerProfileMarginBottom' },
  { value: 'both', label: 'printerProfileMarginBoth' },
];
const LAYOUT_OPTIONS: Array<{ value: PrinterTicketLayout; label: string }> = [
  { value: 'classic', label: 'printerProfileLayoutClassic' },
  { value: 'compact', label: 'printerProfileLayoutCompact' },
];
const FONT_SIZE_OPTIONS: Array<{ value: PrinterTicketFontSize; label: string }> = [
  { value: 'small', label: 'printerProfileFontSmall' },
  { value: 'medium', label: 'printerProfileFontMedium' },
  { value: 'large', label: 'printerProfileFontLarge' },
];
const SORT_OPTIONS: Array<{ value: PrinterItemSortOrder; label: string }> = [
  { value: 'default', label: 'printerProfileSortDefault' },
  { value: 'alphabetical', label: 'printerProfileSortAlphabetical' },
  { value: 'category_alphabetical', label: 'printerProfileSortCategoryAlphabetical' },
  { value: 'category_custom', label: 'printerProfileSortCategoryCustom' },
  { value: 'seat', label: 'printerProfileSortSeat' },
];

interface ProfileEditorState extends SavePrinterProfileInput { id?: string }

export default function PrinterProfilesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('printers.manage');
  const [activeTab, setActiveTab] = useState<PrintingCenterTab>('overview');
  const [center, setCenter] = useState<PrintingCenterSnapshot | null>(null);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [printers, setPrinters] = useState<PrinterConfiguration[]>([]);
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PrinterProfile | null>(null);
  const [editor, setEditor] = useState<ProfileEditorState | null>(null);
  const [assignmentProfile, setAssignmentProfile] = useState<PrinterProfile | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<PrinterProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyCenter = useCallback((snapshot: PrintingCenterSnapshot) => {
    setCenter(snapshot); setProfiles(snapshot.profiles); setPrinters(snapshot.printers); setAgents(snapshot.agents);
  }, []);
  const refreshCenter = useCallback(async () => {
    try {
      const snapshot = await getPrintingCenter(rid);
      applyCenter(snapshot); setError(null);
    } catch { setError(t('printerLoadError')); }
  }, [applyCenter, rid, t]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [snapshot, menuCategories] = await Promise.all([
        getPrintingCenter(rid), getAllCategories(rid),
      ]);
      applyCenter(snapshot); setCategories(menuCategories);
    } catch { setError(t('printerLoadError')); } finally { setLoading(false); }
  }, [applyCenter, rid, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && activeTab !== 'profiles') void refreshCenter();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeTab, refreshCenter]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return query ? profiles.filter((profile) => profile.name.toLocaleLowerCase(locale).includes(query)) : profiles;
  }, [profiles, search, locale]);

  const createProfile = () => {
    setEditor({
      name: '', job_types: [], dine_in_category_ids: categories.map((category) => category.id),
      online_category_ids: categories.map((category) => category.id), auto_print_new_categories: true,
      one_item_per_ticket: false, print_recipient_information: true,
      hide_ticket_footer: true, ticket_margins: 'both', print_kitchen_names: true,
      combine_identical_items: false, ticket_layout: 'classic', font_size: 'medium',
      item_sort_order: 'default', copies: 1, enabled: true,
    });
    setError(null); setNotice(null);
  };
  const editProfile = (profile: PrinterProfile) => {
    setSelected(null);
    setEditor({
      id: profile.id, name: profile.name, job_types: [...profile.job_types],
      dine_in_category_ids: [...profile.dine_in_category_ids],
      online_category_ids: [...profile.online_category_ids],
      auto_print_new_categories: profile.auto_print_new_categories,
      one_item_per_ticket: profile.one_item_per_ticket,
      print_recipient_information: profile.print_recipient_information,
      hide_ticket_footer: profile.hide_ticket_footer, ticket_margins: profile.ticket_margins,
      print_kitchen_names: profile.print_kitchen_names,
      combine_identical_items: profile.combine_identical_items,
      ticket_layout: profile.ticket_layout, font_size: profile.font_size,
      item_sort_order: profile.item_sort_order, copies: profile.copies,
      enabled: profile.enabled,
    });
    setError(null);
  };
  const saveProfile = async () => {
    if (!editor) return;
    if (!editor.name.trim() || editor.job_types.length === 0) { setError(t('printerProfileValidationError')); return; }
    setSaving(true); setError(null);
    try {
      const input: SavePrinterProfileInput = { ...editor, name: editor.name.trim() };
      const saved = editor.id
        ? await updatePrinterProfile(rid, editor.id, input)
        : await createPrinterProfile(rid, input);
      setProfiles((current) => editor.id
        ? current.map((profile) => profile.id === saved.id ? saved : profile)
        : [...current, saved]);
      setEditor(null); setNotice(t('printerProfileSaved')); await refreshCenter();
    } catch { setError(t('printerProfileSaveError')); } finally { setSaving(false); }
  };
  const duplicateProfile = async (profile: PrinterProfile) => {
    setError(null);
    try {
      const copy = await duplicatePrinterProfile(rid, profile.id);
      setProfiles((current) => [...current, copy]); setNotice(t('printerProfileDuplicated')); await refreshCenter();
    } catch { setError(t('printerProfileSaveError')); }
  };
  const editAssignments = (profile: PrinterProfile) => {
    setSelected(null); setAssignmentProfile(profile);
    setAssignments(Object.fromEntries(profile.assignments.map((assignment) => [assignment.device_id, assignment.printer_id])));
    setError(null);
  };
  const saveAssignments = async () => {
    if (!assignmentProfile) return;
    setSaving(true); setError(null);
    try {
      const saved = await replacePrinterProfileAssignments(rid, assignmentProfile.id, agents.flatMap((device) => {
        const printerId = assignments[device.spooler_id];
        return printerId ? [{ device_id: device.spooler_id, device_name: device.name, printer_id: printerId }] : [];
      }));
      setProfiles((current) => current.map((profile) => profile.id === saved.id ? saved : profile));
      setAssignmentProfile(null); setNotice(t('printerProfileAssignmentsSaved')); await refreshCenter();
    } catch { setError(t('printerProfileAssignmentsError')); } finally { setSaving(false); }
  };
  const removeProfile = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deletePrinterProfile(rid, deleteTarget.id);
      setProfiles((current) => current.filter((profile) => profile.id !== deleteTarget.id));
      setSelected(null); setDeleteTarget(null); await refreshCenter();
    } catch { setError(t('printerProfileDeleteError')); } finally { setSaving(false); }
  };

  const headerActions = <div className="flex gap-2"><Button variant="secondary" size="md" onClick={() => void refreshCenter()}><RefreshCw />{t('refresh')}</Button>{activeTab === 'profiles' && canEdit && <Button variant="primary" size="md" onClick={createProfile}><Plus />{t('printerProfileCreate')}</Button>}</div>;

  return <div className="max-w-[1240px]">
    <PageHead title={t('printingCenterTitle')} desc={t('printingCenterDesc')} actions={headerActions} />
    {notice && <div className="mb-4"><Feedback tone="success" text={notice} /></div>}
    {error && !editor && !assignmentProfile && <div className="mb-4"><Feedback tone="danger" text={error} /></div>}
    <Tabs variant="underline" value={activeTab} onValueChange={(value) => setActiveTab(value as PrintingCenterTab)}>
      <TabsList className="mb-5"><Tab value="overview">{t('printingCenterTabOverview')}</Tab><Tab value="printers">{t('printers')}</Tab><Tab value="profiles">{t('printerProfilesTitle')}</Tab><Tab value="queue">{t('printingCenterTabQueue')}</Tab></TabsList>
      {loading || !center ? <Section><div className="flex items-center justify-center gap-2 py-12 text-fs-sm text-[var(--fg-muted)]"><RefreshCw className="h-4 w-4 animate-spin" />{t('loading')}</div></Section> : <>
        <TabsContent value="overview"><PrintingCenterPanel restaurantId={rid} center={center} tab="overview" canEdit={canEdit} locale={locale} t={t} onNavigate={setActiveTab} onRefresh={refreshCenter} /></TabsContent>
        <TabsContent value="printers"><PrintingCenterPanel restaurantId={rid} center={center} tab="printers" canEdit={canEdit} locale={locale} t={t} onNavigate={setActiveTab} onRefresh={refreshCenter} /></TabsContent>
        <TabsContent value="queue"><PrintingCenterPanel restaurantId={rid} center={center} tab="queue" canEdit={canEdit} locale={locale} t={t} onNavigate={setActiveTab} onRefresh={refreshCenter} /></TabsContent>
        <TabsContent value="profiles">{profiles.length === 0 && !search ? <Section><EmptyState icon={<Settings2 />} title={t('printerProfileEmptyTitle')} desc={t('printerProfileEmptyDesc')} action={canEdit ? <Button variant="primary" size="md" onClick={createProfile}><Plus />{t('printerProfileCreate')}</Button> : undefined} /></Section> : <><div className="relative mb-4 max-w-[420px]"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('printerProfileSearch')} className="ps-10" /></div><TableShell className="overflow-x-auto"><Table className="min-w-[820px]"><Thead><Tr><Th>{t('name')}</Th><Th>{t('printerProfileAssignedPrinters')}</Th><Th>{t('printerProfilePrintedCategories')}</Th><Th className="w-14"><span className="sr-only">{t('actions')}</span></Th></Tr></Thead><Tbody>{filteredProfiles.map((profile) => <Tr key={profile.id} className="cursor-pointer" onClick={() => setSelected(profile)}><Td><div className="font-semibold">{profile.name}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{profile.job_types.map((type) => jobTypeLabel(type, t)).join(', ')}</div></Td><Td>{profile.assignments.length ? <div className="space-y-1">{profile.assignments.slice(0, 2).map((assignment) => <div key={assignment.id} className="text-fs-xs"><span className="font-medium">{assignment.device_name}:</span> {assignment.printer_name}</div>)}{profile.assignments.length > 2 && <div className="text-fs-xs text-[var(--fg-subtle)]">+{profile.assignments.length - 2}</div>}</div> : <span className="text-[var(--fg-subtle)]">{t('printerProfileNoPrinter')}</span>}</Td><Td><span className="text-fs-xs leading-relaxed text-[var(--fg-muted)]">{categorySummary(profile, categories, t)}</span></Td><Td onClick={(event) => event.stopPropagation()}>{canEdit && <ProfileMenu profile={profile} t={t} onEdit={editProfile} onDuplicate={(item) => void duplicateProfile(item)} onAssignments={editAssignments} onDelete={setDeleteTarget} />}</Td></Tr>)}</Tbody></Table></TableShell>{filteredProfiles.length === 0 && <div className="py-10 text-center text-fs-sm text-[var(--fg-muted)]">{t('printerProfileNoSearchResults')}</div>}</>}</TabsContent>
      </>}
    </Tabs>
    <ProfileDrawer profile={selected} categories={categories} canEdit={canEdit} t={t} onClose={() => setSelected(null)} onEdit={editProfile} onAssignments={editAssignments} />
    <ProfileEditor editor={editor} categories={categories} saving={saving} error={error} t={t} onChange={setEditor} onSave={() => void saveProfile()} onAssign={() => { const profile = profiles.find((item) => item.id === editor?.id); if (profile) { setEditor(null); editAssignments(profile); } }} onClose={() => { setEditor(null); setError(null); }} />
    <AssignmentEditor profile={assignmentProfile} agents={agents} printers={printers} assignments={assignments} saving={saving} error={error} t={t} onChange={setAssignments} onSave={() => void saveAssignments()} onClose={() => { setAssignmentProfile(null); setError(null); }} />
    <ConfirmDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title={t('printerProfileDeleteTitle')} description={t('printerProfileDeleteConfirm')} confirmLabel={saving ? t('saving') : t('remove')} cancelLabel={t('cancel')} danger onConfirm={() => void removeProfile()} />
  </div>;
}

function ProfileMenu({ profile, t, onEdit, onDuplicate, onAssignments, onDelete }: { profile: PrinterProfile; t: T; onEdit: (profile: PrinterProfile) => void; onDuplicate: (profile: PrinterProfile) => void; onAssignments: (profile: PrinterProfile) => void; onDelete: (profile: PrinterProfile) => void }) { return <Menu><MenuTrigger asChild><Button variant="ghost" size="sm" icon aria-label={t('actions')}><MoreHorizontal /></Button></MenuTrigger><MenuContent align="end"><MenuItem onSelect={() => onEdit(profile)}><Pencil />{t('printerProfileEdit')}</MenuItem><MenuItem onSelect={() => onDuplicate(profile)}><Copy />{t('printerProfileDuplicate')}</MenuItem><MenuItem onSelect={() => onAssignments(profile)}><Printer />{t('printerProfileEditAssignments')}</MenuItem><MenuSeparator /><MenuItem danger onSelect={() => onDelete(profile)}><Trash2 />{t('printerProfileDelete')}</MenuItem></MenuContent></Menu>; }

function ProfileDrawer({ profile, categories, canEdit, t, onClose, onEdit, onAssignments }: { profile: PrinterProfile | null; categories: MenuCategory[]; canEdit: boolean; t: T; onClose: () => void; onEdit: (profile: PrinterProfile) => void; onAssignments: (profile: PrinterProfile) => void }) { return <Drawer open={profile !== null} onOpenChange={(open) => { if (!open) onClose(); }} title={profile?.name ?? ''} width={620} primaryAction={profile && canEdit ? <Button variant="secondary" size="sm" onClick={() => onEdit(profile)}><Pencil />{t('edit')}</Button> : undefined}>{profile && <div className="space-y-7"><DetailSection title={t('printerProfileTicketTypes')}><div className="divide-y divide-[var(--line)]">{profile.job_types.map((type) => { const meta = JOB_TYPES.find((job) => job.type === type); const Icon = meta?.icon ?? Printer; return <div key={type} className="flex gap-3 py-3 first:pt-0"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)]"><Icon className="h-4 w-4" /></div><div><div className="text-fs-sm font-semibold">{jobTypeLabel(type, t)}</div><div className="text-fs-xs text-[var(--fg-muted)]">{meta ? t(meta.desc) : ''}</div></div></div>; })}</div></DetailSection>{profile.job_types.includes('dine_in_tickets') && <DetailSection title={t('printerProfileDineInCategories')}><CategoryDetail ids={profile.dine_in_category_ids} categories={categories} t={t} /></DetailSection>}{profile.job_types.includes('online_tickets') && <DetailSection title={t('printerProfileOnlineCategories')}><CategoryDetail ids={profile.online_category_ids} categories={categories} t={t} /></DetailSection>}<DetailSection title={t('printerProfileAssociatedDevices')}><p className="mb-3 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileAssociatedDevicesDesc')}</p>{profile.assignments.length ? <div className="divide-y divide-[var(--line)] rounded-r-md border border-[var(--line)]">{profile.assignments.map((assignment) => <div key={assignment.id} className="grid grid-cols-2 gap-3 px-4 py-3 text-fs-sm"><div><div className="text-fs-xs text-[var(--fg-subtle)]">{t('printerProfileDevice')}</div><div className="font-medium">{assignment.device_name}</div></div><div><div className="text-fs-xs text-[var(--fg-subtle)]">{t('printers')}</div><div className="font-medium">{assignment.printer_name}</div><div className="text-fs-xs text-[var(--fg-muted)]">{assignment.printer_model}</div></div></div>)}</div> : <div className="text-fs-sm text-[var(--fg-subtle)]">{t('printerProfileNoPrinter')}</div>}{canEdit && <Button variant="secondary" size="sm" className="mt-4" onClick={() => onAssignments(profile)}><Printer />{t('printerProfileEditAssignments')}</Button>}</DetailSection></div>}</Drawer>; }
function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section><h3 className="mb-3 border-b border-[var(--line)] pb-3 text-fs-md font-semibold">{title}</h3>{children}</section>; }
function CategoryDetail({ ids, categories, t }: { ids: number[]; categories: MenuCategory[]; t: T }) { const selected = categories.filter((category) => ids.includes(category.id)); return selected.length ? <div className="space-y-3">{selected.map((category) => <div key={category.id}><div className="text-fs-sm font-semibold">{category.name}</div><div className="text-fs-xs text-[var(--fg-muted)]">{t('printerProfileCategorySelected')}</div></div>)}</div> : <div className="text-fs-sm text-[var(--fg-subtle)]">{t('printerProfileNoCategories')}</div>; }

function ProfileEditor({ editor, categories, saving, error, t, onChange, onSave, onAssign, onClose }: { editor: ProfileEditorState | null; categories: MenuCategory[]; saving: boolean; error: string | null; t: T; onChange: (value: ProfileEditorState | null) => void; onSave: () => void; onAssign: () => void; onClose: () => void }) {
  if (!editor) return null;
  const toggleJob = (type: PrinterProfileJobType, checked: boolean) => onChange({ ...editor, job_types: checked ? [...editor.job_types, type] : editor.job_types.filter((value) => value !== type) });
  const ticketOptionsOwner: PrinterProfileJobType | null = editor.job_types.includes('dine_in_tickets') ? 'dine_in_tickets' : editor.job_types.includes('online_tickets') ? 'online_tickets' : null;
  return <FullScreenEditor open title={editor.id ? t('printerProfileEdit') : t('printerProfileCreate')} saveLabel={saving ? t('saving') : t('save')} saveDisabled={saving || !editor.name.trim() || editor.job_types.length === 0} showCancel={false} status={editor.id ? <Button variant="secondary" size="md" onClick={onAssign}><Printer />{t('printerProfileAssignPrinters')}</Button> : undefined} onOpenChange={(open) => { if (!open) onClose(); }} onSave={onSave}>
    <div className="mx-auto max-w-[840px] space-y-8">
      <Field label={t('printerProfileName')} grow><Input value={editor.name} onChange={(event) => onChange({ ...editor, name: event.target.value })} maxLength={120} placeholder={t('printerProfileNamePlaceholder')} /></Field>
      <section>
        <h2 className="text-fs-lg font-semibold">{t('printerProfileJobTypes')}</h2>
        <p className="mt-1 max-w-[72ch] text-fs-sm text-[var(--fg-muted)]">{t('printerProfileJobTypesDesc')}</p>
        <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {JOB_TYPES.map(({ type, title, desc, icon: Icon }) => <div key={type} className="py-5">
            <div className="flex items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)]"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-fs-sm font-semibold">{t(title)}</div><div className="mt-0.5 max-w-[68ch] text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t(desc)}</div></div><Switch checked={editor.job_types.includes(type)} onCheckedChange={(checked) => toggleJob(type, checked)} aria-label={t(title)} /></div>
            {type === 'dine_in_tickets' && editor.job_types.includes(type) && <CategorySelector ids={editor.dine_in_category_ids} categories={categories} t={t} onChange={(ids) => onChange({ ...editor, dine_in_category_ids: ids })} />}
            {type === 'online_tickets' && editor.job_types.includes(type) && <CategorySelector ids={editor.online_category_ids} categories={categories} t={t} onChange={(ids) => onChange({ ...editor, online_category_ids: ids })} />}
            {type === ticketOptionsOwner && <TicketFormatOptions editor={editor} t={t} onChange={onChange} />}
          </div>)}
        </div>
      </section>
      <OptionRow checked={editor.enabled} label={t('printerProfileEnabled')} onChange={(checked) => onChange({ ...editor, enabled: checked })} />
      {error && <Feedback tone="danger" text={error} />}
    </div>
  </FullScreenEditor>;
}

function TicketFormatOptions({ editor, t, onChange }: { editor: ProfileEditorState; t: T; onChange: (value: ProfileEditorState) => void }) {
  return <div className="ms-14 mt-5 border-t border-[var(--line)] pt-2">
    <OptionRow checked={editor.auto_print_new_categories} label={t('printerProfileAutoNewCategories')} onChange={(checked) => onChange({ ...editor, auto_print_new_categories: checked })} />
    <OptionRow checked={editor.one_item_per_ticket} label={t('printerProfileOneItemPerTicket')} onChange={(checked) => onChange({ ...editor, one_item_per_ticket: checked })} />
    <OptionRow checked={editor.print_recipient_information} label={t('printerProfileRecipientInfo')} onChange={(checked) => onChange({ ...editor, print_recipient_information: checked })} />
    <OptionRow checked={editor.hide_ticket_footer} label={t('printerProfileHideFooter')} description={t('printerProfileHideFooterDesc')} onChange={(checked) => onChange({ ...editor, hide_ticket_footer: checked })} />
    <SelectOption label={t('printerProfileTicketMargins')} value={editor.ticket_margins} options={MARGIN_OPTIONS} t={t} onChange={(value) => onChange({ ...editor, ticket_margins: value as PrinterTicketMargins })} />
    <OptionRow checked={editor.print_kitchen_names} label={t('printerProfilePrintKitchenNames')} onChange={(checked) => onChange({ ...editor, print_kitchen_names: checked })} />
    <OptionRow checked={editor.combine_identical_items} label={t('printerProfileCombineItems')} onChange={(checked) => onChange({ ...editor, combine_identical_items: checked })} />
    <SelectOption label={t('printerProfileTicketLayout')} value={editor.ticket_layout} options={LAYOUT_OPTIONS} t={t} onChange={(value) => onChange({ ...editor, ticket_layout: value as PrinterTicketLayout })} />
    <SelectOption label={t('printerProfileFontSize')} value={editor.font_size} options={FONT_SIZE_OPTIONS} t={t} onChange={(value) => onChange({ ...editor, font_size: value as PrinterTicketFontSize })} />
    <SelectOption label={t('printerProfileItemSort')} value={editor.item_sort_order} options={SORT_OPTIONS} t={t} onChange={(value) => onChange({ ...editor, item_sort_order: value as PrinterItemSortOrder })} />
    <div className="flex items-center justify-between gap-5 border-b border-[var(--line)] py-4"><span className="text-fs-sm font-semibold">{t('printerProfileCopies')}</span><div className="flex items-center rounded-full border border-[var(--line)] p-1"><Button variant="ghost" size="sm" icon aria-label={t('decrease')} disabled={editor.copies <= 1} onClick={() => onChange({ ...editor, copies: Math.max(1, editor.copies - 1) })}><Minus /></Button><span className="min-w-10 text-center text-fs-sm font-semibold tabular-nums">{editor.copies}</span><Button variant="ghost" size="sm" icon aria-label={t('increase')} disabled={editor.copies >= 5} onClick={() => onChange({ ...editor, copies: Math.min(5, editor.copies + 1) })}><Plus /></Button></div></div>
  </div>;
}

function CategorySelector({ ids, categories, t, onChange }: { ids: number[]; categories: MenuCategory[]; t: T; onChange: (ids: number[]) => void }) {
  const allSelected = categories.length > 0 && categories.every((category) => ids.includes(category.id));
  return <details className="relative ms-14 mt-5"><summary className="flex cursor-pointer list-none items-center justify-between rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-fs-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] [&::-webkit-details-marker]:hidden"><span><span className="block text-fs-xs text-[var(--fg-muted)]">{t('printerProfileCategoriesToPrint')}</span>{ids.length} {t('printerProfileSelected')}</span><span aria-hidden className="text-[var(--fg-subtle)]">⌄</span></summary><div className="absolute inset-x-0 z-20 mt-2 max-h-80 overflow-y-auto rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-3"><label className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 text-fs-sm font-semibold"><span>{t('selectAll')}</span><Checkbox checked={allSelected} onCheckedChange={(checked) => onChange(checked ? categories.map((category) => category.id) : [])} /></label><div className="grid gap-3 sm:grid-cols-2">{categories.map((category) => <label key={category.id} className="flex items-center justify-between gap-3 text-fs-sm"><span>{category.name}</span><Checkbox checked={ids.includes(category.id)} onCheckedChange={(checked) => onChange(checked ? [...ids, category.id] : ids.filter((id) => id !== category.id))} /></label>)}</div></div></details>;
}

function OptionRow({ checked, label, description, onChange }: { checked: boolean; label: string; description?: string; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between gap-5 border-b border-[var(--line)] py-4"><span><span className="block text-fs-sm font-semibold">{label}</span>{description && <span className="mt-1 block max-w-[62ch] text-fs-xs leading-relaxed text-[var(--fg-muted)]">{description}</span>}</span><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} /></label>; }
function SelectOption({ label, value, options, t, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; t: T; onChange: (value: string) => void }) { return <div className="border-b border-[var(--line)] py-4"><Field label={label} grow><Select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</Select></Field></div>; }

function AssignmentEditor({ profile, agents, printers, assignments, saving, error, t, onChange, onSave, onClose }: { profile: PrinterProfile | null; agents: PrintAgent[]; printers: PrinterConfiguration[]; assignments: Record<string, string>; saving: boolean; error: string | null; t: T; onChange: (value: Record<string, string>) => void; onSave: () => void; onClose: () => void }) {
  if (!profile) return null;
  return <FullScreenEditor open title={`${t('printerProfileAssignTo')} ${profile.name}`} saveLabel={saving ? t('saving') : t('save')} saveDisabled={saving} onOpenChange={(open) => { if (!open) onClose(); }} onSave={onSave}><div className="mx-auto max-w-[840px]"><h2 className="text-fs-lg font-semibold">{t('printerProfileAssignTitle')}</h2><p className="mt-1 text-fs-sm text-[var(--fg-muted)]">{t('printerProfileAssignDesc')}</p><div className="mt-6 space-y-4">{agents.map((device) => { const availablePrinters = printers.filter((printer) => device.printer_ids.includes(printer.id)); return <div key={device.spooler_id} className="rounded-r-lg border border-[var(--line)] p-5"><div className="mb-4 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-r-md bg-[var(--surface-2)]"><Smartphone className="h-4 w-4" /></div><div><div className="font-semibold">{device.name}</div><div className="text-fs-xs text-[var(--fg-muted)]">{device.model || device.spooler_id}</div></div></div><Field label={t('printers')} grow><Select value={assignments[device.spooler_id] ?? ''} onChange={(event) => onChange({ ...assignments, [device.spooler_id]: event.target.value })}><option value="">{t('printerProfileNoPrinter')}</option>{availablePrinters.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.model}</option>)}</Select></Field>{availablePrinters.length === 0 && <div className="mt-2 text-fs-xs text-[var(--fg-subtle)]">{t('printerProfileNoDiscoveredPrinters')}</div>}</div>; })}</div>{agents.length === 0 && <div className="mt-4 rounded-r-md bg-[var(--surface-2)] px-4 py-3 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileAgentsAppearHint')}</div>}{printers.length === 0 && <div className="mt-4 rounded-r-md bg-[var(--warning-50)] px-4 py-3 text-fs-xs text-[var(--warning-500)]">{t('printerProfileNoDiscoveredPrinters')}</div>}{error && <div className="mt-4"><Feedback tone="danger" text={error} /></div>}</div></FullScreenEditor>;
}

function jobTypeLabel(type: PrinterProfileJobType, t: T) { return t(JOB_TYPES.find((job) => job.type === type)?.title ?? type); }
function categorySummary(profile: PrinterProfile, categories: MenuCategory[], t: T) { const ids = Array.from(new Set([...profile.dine_in_category_ids, ...profile.online_category_ids])); if (!ids.length) return t('printerProfileNoCategories'); return categories.filter((category) => ids.includes(category.id)).map((category) => category.name).join(', ') || `${ids.length} ${t('printerProfileSelected')}`; }
function Feedback({ tone, text }: { tone: 'success' | 'danger'; text: string }) { return <div role={tone === 'danger' ? 'alert' : 'status'} className={tone === 'success' ? 'flex items-start gap-2 rounded-r-md bg-[var(--success-50)] px-3 py-2 text-fs-xs text-[var(--success-500)]' : 'flex items-start gap-2 rounded-r-md bg-[var(--danger-50)] px-3 py-2 text-fs-xs text-[var(--danger-500)]'}><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /><span>{text}</span></div>; }
