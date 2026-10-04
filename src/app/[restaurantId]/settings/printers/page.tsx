'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  CircleAlert, Copy, Globe2, MoreHorizontal, Pencil,
  Minus, Plus, Printer, ReceiptText, RefreshCw, Search, Smartphone, Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {
  createPrinterProfile, deletePrinterProfile, duplicatePrinterProfile, listPrinterProfileCategories,
  listPrintAgents, listPrinterConfigurations, listPrinterProfiles,
  replacePrinterProfileAssignments, updatePrinterProfile,
  type PrinterProfileCategory, type SavePrinterProfileAssignmentInput, type PrintAgent, type PrinterConfiguration, type PrinterProfile,
  type PrinterItemSortOrder, type PrinterProfileJobType, type PrinterTicketFontSize,
  type PrinterTicketLayout, type PrinterTicketMargins, type SavePrinterProfileInput,
} from '@/lib/api';
import { checkedPrinterProfile, checkedPrinterProfiles, checkedPrintHardware, printerProfileInput, printerProfileSignature, printerAssignmentSignature, validPrinterProfileName } from '@/lib/printer-profile-state';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { LearnMore } from '@/components/help/LearnMore';
import { PrinterProfileJobSection } from './PrinterProfileJobSection';
import {
  Button, ConfirmDialog, Drawer, EmptyState, Field, FullScreenEditor, Input,
  Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, PageHead, Section,
  Select, Table, TableShell, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';

type T = (key: string) => string;
const JOB_TYPES: Array<{ type: PrinterProfileJobType; title: string; desc: string; icon: typeof Printer }> = [
  { type: 'receipts', title: 'printerProfileJobReceipts', desc: 'printerProfileJobReceiptsDesc', icon: ReceiptText },
  { type: 'dine_in_tickets', title: 'printerProfileJobDineIn', desc: 'printerProfileJobDineInDesc', icon: UtensilsCrossed },
  { type: 'online_tickets', title: 'printerProfileJobOnline', desc: 'printerProfileJobOnlineDesc', icon: Globe2 },
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

type PendingProfileAction =
  | { kind: 'save'; id?: string; input: SavePrinterProfileInput }
  | { kind: 'assign'; id: string; input: SavePrinterProfileAssignmentInput[] }
  | { kind: 'delete'; id: string }
  | { kind: 'duplicate'; source: PrinterProfile; before: string[] };

/** Restaurant-keyed workspace prevents drafts surviving an account switch. */
export default function PrinterProfilesPage() {
  const { restaurantId } = useParams();
  return <PrinterProfilesWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function PrinterProfilesWorkspace({ rid }: { rid: number }) {
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('printers.manage');
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [printers, setPrinters] = useState<PrinterConfiguration[]>([]);
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [categories, setCategories] = useState<PrinterProfileCategory[]>([]);
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false), [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PrinterProfile | null>(null);
  const [editor, setEditor] = useState<ProfileEditorState | null>(null);
  const [assignmentProfile, setAssignmentProfile] = useState<PrinterProfile | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<PrinterProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingProfileAction | null>(null);
  const [savedVersion, setSavedVersion] = useState<PrinterProfile | null>(null);
  const [discard, setDiscard] = useState<'close' | 'assign' | 'adopt' | null>(null);
  const baseline = useRef(''), lock = useRef(false), sequence = useRef(0), alive = useRef(true);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const assignmentInput = useCallback((): SavePrinterProfileAssignmentInput[] => Object.entries(assignments).filter(([, printer]) => !!printer).map(([device, printer]) => ({ device_id: device, printer_id: printer, device_name: agents.find(row => row.spooler_id === device)?.name ?? assignmentProfile?.assignments.find(row => row.device_id === device)?.device_name ?? device })), [assignments, agents, assignmentProfile]);
  const dirty = editor ? printerProfileSignature(editor) !== baseline.current : assignmentProfile ? printerAssignmentSignature(assignmentInput()) !== baseline.current : false;
  const frozen = saving || !!pending;
  useEffect(() => {
    if (!dirty && !frozen) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, frozen]);
  useEffect(() => { if (error || pending) requestAnimationFrame(() => { const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-profile-feedback]')); nodes[nodes.length - 1]?.focus(); }); }, [error, pending, saving]);
  const load = useCallback(async () => {
    if (lock.current) return;
    const generation = ++sequence.current; setLoading(true); setLoadError(false);
    try {
      const [rows, physical, devices, cats] = await Promise.all([listPrinterProfiles(rid), listPrinterConfigurations(rid), listPrintAgents(rid), listPrinterProfileCategories(rid)]);
      const checked = checkedPrinterProfiles(rows, rid), hardware = checkedPrintHardware(devices, physical, rid);
      if (!alive.current || generation !== sequence.current) return;
      setProfiles(checked); setPrinters(hardware.printers); setAgents(hardware.agents); setCategories(cats); setLoaded(true);
    } catch { if (alive.current && generation === sequence.current) setLoadError(true); }
    finally { if (alive.current && generation === sequence.current) setLoading(false); }
  }, [rid]);
  useEffect(() => { void load(); }, [load]);
  const clearFeedback = () => { setError(null); setNotice(null); setSavedVersion(null); };
  const editProfile = (profile: PrinterProfile) => { if (!canEdit || frozen) return; const draft = { id: profile.id, ...printerProfileInput(profile) }; baseline.current = printerProfileSignature(draft); setSelected(null); setEditor(draft); clearFeedback(); };
  const createProfile = () => {
    if (!canEdit || frozen || !loaded) return;
    const draft: ProfileEditorState = { name: '', job_types: [], dine_in_category_ids: categories.map(row => row.id), online_category_ids: categories.map(row => row.id), auto_print_new_categories: true, one_item_per_ticket: false, print_recipient_information: true, hide_ticket_footer: true, ticket_margins: 'both', print_kitchen_names: true, combine_identical_items: false, ticket_layout: 'classic', font_size: 'medium', item_sort_order: 'default', copies: 1, enabled: true };
    baseline.current = printerProfileSignature(draft); setEditor(draft); clearFeedback();
  };
  const editAssignments = (profile: PrinterProfile) => { if (!canEdit || frozen) return; baseline.current = printerAssignmentSignature(profile.assignments); setAssignments(Object.fromEntries(profile.assignments.map(row => [row.device_id, row.printer_id]))); setSelected(null); setEditor(null); setAssignmentProfile(profile); clearFeedback(); };
  const leave = (action: 'close' | 'assign') => { if (frozen || lock.current) return; if (dirty) { setDiscard(action); return; } performLeave(action); };
  const performLeave = (action: 'close' | 'assign') => { const current = profiles.find(row => row.id === editor?.id); setEditor(null); setAssignmentProfile(null); clearFeedback(); if (action === 'assign' && current) editAssignments(current); };
  const accept = (profile: PrinterProfile, key: string) => { setProfiles(rows => rows.some(row => row.id === profile.id) ? rows.map(row => row.id === profile.id ? profile : row) : [...rows, profile]); setEditor(null); setAssignmentProfile(null); setPending(null); setSavedVersion(null); setError(null); setNotice(key); };
  const begin = () => { if (!canEdit || lock.current || pending) return false; lock.current = true; sequence.current++; setSaving(true); clearFeedback(); return true; };
  const finish = () => { lock.current = false; if (alive.current) setSaving(false); };
  const run = async (action: PendingProfileAction) => {
    if (!begin()) return;
    try {
      if (action.kind === 'delete') { await deletePrinterProfile(rid, action.id); if (alive.current) { setProfiles(rows => rows.filter(row => row.id !== action.id)); setSelected(null); setDeleteTarget(null); setNotice('printerProfileRemoved'); } }
      else {
        const result = action.kind === 'save' ? action.id ? await updatePrinterProfile(rid, action.id, action.input) : await createPrinterProfile(rid, action.input) : action.kind === 'assign' ? await replacePrinterProfileAssignments(rid, action.id, action.input) : await duplicatePrinterProfile(rid, action.source.id);
        const saved = checkedPrinterProfile(result, rid, action.kind === 'duplicate' ? undefined : action.id);
        if (action.kind === 'duplicate' && action.before.includes(saved.id)) throw new Error('Duplicate did not return a new profile');
        if (alive.current) accept(saved, action.kind === 'save' ? 'printerProfileSaved' : action.kind === 'assign' ? 'printerProfileAssignmentsSaved' : 'printerProfileDuplicated');
      }
    } catch { if (alive.current) { setPending(action); setDeleteTarget(null); setError('printerProfileUncertain'); } }
    finally { finish(); }
  };
  const saveProfile = () => {
    if (!editor || !dirty || frozen || !canEdit) return;
    if (!validPrinterProfileName(editor.name)) { setError('printerProfileNameLimit'); nameRef.current?.focus(); return; }
    if (!editor.job_types.length) { setError('printerProfileValidationError'); return; }
    if (profiles.some(row => row.id !== editor.id && row.name.trim().toLowerCase() === editor.name.trim().toLowerCase())) { setError('printerProfileNameConflict'); nameRef.current?.focus(); return; }
    void run({ kind: 'save', id: editor.id, input: printerProfileInput(editor) });
  };
  const recover = async () => {
    if (!pending || lock.current) return;
    lock.current = true; setSaving(true); setError(null); const action = pending;
    try {
      const rows = checkedPrinterProfiles(await listPrinterProfiles(rid), rid);
      if (!alive.current) return;
      setProfiles(rows); setPending(null);
      if (action.kind === 'delete') { if (!rows.some(row => row.id === action.id)) { setSelected(null); setNotice('printerProfileRemoved'); } else { setSelected(rows.find(row => row.id === action.id)!); setError('printerProfileStillPresent'); } }
      else if (action.kind === 'duplicate') {
        const expected = { ...printerProfileInput(action.source), name: '' };
        const copies = rows.filter(row => !action.before.includes(row.id) && row.name.startsWith(`${action.source.name} (copy)`) && !row.assignments.length && printerProfileSignature({ ...row, name: '' }) === printerProfileSignature(expected));
        if (copies.length === 1) accept(copies[0], 'printerProfileDuplicated'); else { setSelected(null); setError('printerProfileDuplicateReview'); }
      } else {
        const current = action.id ? rows.find(row => row.id === action.id) : rows.find(row => row.name.toLowerCase() === (action.kind === 'save' ? action.input.name.toLowerCase() : ''));
        const matched = current && (action.kind === 'save' ? printerProfileSignature(current) === printerProfileSignature(action.input) : printerAssignmentSignature(current.assignments) === printerAssignmentSignature(action.input));
        if (matched && current) accept(current, action.kind === 'save' ? 'printerProfileSaved' : 'printerProfileAssignmentsSaved');
        else { setSavedVersion(current ?? null); setError(current ? 'printerProfileSavedDiffers' : action.id ? 'printerProfileMissing' : 'printerProfileNotFoundAfterSave'); }
      }
    } catch { if (alive.current) setError('printerProfileReadbackError'); }
    finally { finish(); }
  };
  const filteredProfiles = useMemo(() => { const query = search.trim().toLocaleLowerCase(locale); return profiles.filter(profile => !query || `${profile.name} ${profile.assignments.map(row => `${row.device_name} ${row.printer_name}`).join(' ')}`.toLocaleLowerCase(locale).includes(query)); }, [profiles, search, locale]);
  const feedback = <>{notice && <Feedback tone="success" text={t(notice)} />}{(error || pending) && <div data-profile-feedback tabIndex={-1} className="space-y-3 rounded-r-lg border border-[var(--danger-500)] p-4 focus:outline-none"><Feedback tone="danger" text={t(error ?? 'printerProfileUncertain')} />{pending && <Button variant="secondary" size="sm" disabled={saving} onClick={() => void recover()}><RefreshCw />{t('printerProfileVerify')}</Button>}{savedVersion && <><details className="text-fs-sm"><summary className="cursor-pointer font-semibold">{t('printerProfileSavedVersion')}</summary><ProfileSnapshot profile={savedVersion} categories={categories} t={t} /></details><Button variant="secondary" size="sm" disabled={!canEdit || frozen} onClick={() => setDiscard('adopt')}>{t('printerProfileUseSaved')}</Button></>}</div>}</>;
  const menu = (profile: PrinterProfile) => canEdit ? <ProfileMenu profile={profile} disabled={frozen} t={t} onEdit={editProfile} onDuplicate={item => void run({ kind: 'duplicate', source: item, before: profiles.map(row => row.id) })} onAssignments={editAssignments} onDelete={setDeleteTarget} /> : null;
  return <div className="mx-auto w-full max-w-[1240px] pb-8">
    <PageHead title={t('printerProfilesTitle')} desc={t('printerProfilesDesc')} actions={<div className="flex flex-wrap items-center gap-3"><LearnMore feature="printers" label={t('printingSetupGuide')} />{canEdit && <Button variant="primary" size="md" disabled={!loaded || frozen || loading} onClick={createProfile}><Plus />{t('printerProfileCreate')}</Button>}</div>} />
    {!editor && !assignmentProfile && !selected && <div className="mb-5 space-y-3">{feedback}</div>}
    {loadError && <div className="mb-5 space-y-3"><Feedback tone="danger" text={t('printerLoadError')} /><Button variant="secondary" size="sm" disabled={loading || frozen} onClick={() => void load()}>{t('retry')}</Button></div>}
    {!loaded && loading ? <Section><div role="status" className="flex justify-center gap-3 py-12"><RefreshCw className="size-5 animate-spin" />{t('loading')}</div></Section> : loaded && <>
      <div className="mb-6 rounded-r-xl bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><div className="flex items-center gap-3 font-semibold"><Printer className="size-5" />{t('printerProfileWorkspaceTitle')}</div><p className="mt-2 text-fs-sm">{t('printerProfileWorkspaceDesc')}</p><p className="mt-3 text-fs-sm font-semibold">{t('printerProfileCounts').replace('{profiles}', String(profiles.length)).replace('{assigned}', String(profiles.filter(row => row.assignments.length > 0).length))}</p></div>
      <div className="mb-5 flex items-end gap-3"><Field label={t('printerProfileSearch')} grow><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field><Button variant="secondary" size="md" icon aria-label={t('refresh')} disabled={loading || frozen} onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button></div>
      {!profiles.length ? <Section><EmptyState icon={<Printer />} title={t('printerProfileEmptyTitle')} desc={t('printerProfileEmptyDesc')} /></Section> : !filteredProfiles.length ? <Section><EmptyState icon={<Search />} title={t('printerProfileNoSearchResults')} action={<Button variant="secondary" size="sm" onClick={() => setSearch('')}>{t('reset')}</Button>} /></Section> : <>
        <div className="space-y-3 md:hidden">{filteredProfiles.map(profile => <article key={profile.id} className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-3"><button className="min-w-0 text-start text-fs-md font-semibold text-[var(--brand-ink)] underline underline-offset-4 [overflow-wrap:anywhere]" onClick={() => { setSelected(profile); clearFeedback(); }} disabled={frozen} dir="auto">{profile.name}</button>{menu(profile)}</div><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{profile.job_types.map(type => jobTypeLabel(type, t)).join(' · ')} · {t(profile.enabled ? 'enabled' : 'disabled')}</p><div className="mt-4 text-fs-sm"><AssignmentSummary profile={profile} t={t} /></div><p className="mt-3 text-fs-xs text-[var(--fg-muted)] [overflow-wrap:anywhere]" dir="auto">{categorySummary(profile, categories, t)}</p></article>)}</div>
        <TableShell className="hidden md:block"><Table><Thead><Tr><Th>{t('name')}</Th><Th>{t('printerProfileAssignedPrinters')}</Th><Th>{t('printerProfilePrintedCategories')}</Th><Th><span className="sr-only">{t('actions')}</span></Th></Tr></Thead><Tbody>{filteredProfiles.map(profile => <Tr key={profile.id}><Td className="max-w-[320px]"><button className="text-start font-semibold text-[var(--brand-ink)] underline underline-offset-4 [overflow-wrap:anywhere]" dir="auto" disabled={frozen} onClick={() => { setSelected(profile); clearFeedback(); }}>{profile.name}</button><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{profile.job_types.map(type => jobTypeLabel(type,t)).join(' · ')} · {t(profile.enabled ? 'enabled' : 'disabled')}</p></Td><Td className="max-w-[280px] [overflow-wrap:anywhere]"><AssignmentSummary profile={profile} t={t} /></Td><Td className="max-w-[280px] text-fs-xs [overflow-wrap:anywhere]">{categorySummary(profile,categories,t)}</Td><Td>{menu(profile)}</Td></Tr>)}</Tbody></Table></TableShell>
      </>}
    </>}
    <ProfileDrawer profile={selected} categories={categories} canEdit={canEdit && !frozen} closeDisabled={frozen} feedback={feedback} t={t} onClose={() => setSelected(null)} onEdit={editProfile} onAssignments={editAssignments} />
    <ProfileEditor editor={editor} categories={categories} saving={saving} closeDisabled={frozen} frozen={frozen || !canEdit} dirty={dirty} feedback={feedback} nameRef={nameRef} t={t} onChange={setEditor} onSave={saveProfile} onAssign={() => leave('assign')} onClose={() => leave('close')} />
    <AssignmentEditor profile={assignmentProfile} agents={agents} printers={printers} assignments={assignments} saving={saving} closeDisabled={frozen} frozen={frozen || !canEdit} dirty={dirty} feedback={feedback} t={t} onChange={setAssignments} onSave={() => { if (assignmentProfile && dirty) void run({ kind: 'assign', id: assignmentProfile.id, input: assignmentInput() }); }} onClose={() => leave('close')} />
    <ConfirmDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !lock.current) setDeleteTarget(null); }} title={t('printerProfileDeleteTitle')} description={<><strong dir="auto">{deleteTarget?.name}</strong><span className="mt-2 block">{t('printerProfileDeleteConfirm')}</span></>} confirmLabel={saving ? t('saving') : t('remove')} cancelLabel={t('cancel')} danger onConfirm={() => { if (deleteTarget) void run({ kind: 'delete', id: deleteTarget.id }); }} />
    <ConfirmDialog open={!!discard} onOpenChange={open => { if (!open) setDiscard(null); }} title={t('discardUnsavedChanges')} description={t(discard === 'adopt' ? 'printerProfileAdoptConfirm' : 'discountDiscardHint')} confirmLabel={t(discard === 'adopt' ? 'printerProfileUseSaved' : 'discardChanges')} cancelLabel={t('cancel')} danger onConfirm={() => { if (frozen || lock.current) return; const action = discard; setDiscard(null); if (action === 'adopt' && savedVersion) { if (assignmentProfile) editAssignments(savedVersion); else if (editor?.id) editProfile(savedVersion); else { setEditor(null); setSelected(savedVersion); clearFeedback(); } } else if (action === 'close' || action === 'assign') performLeave(action); }} />
  </div>;
}
function AssignmentSummary({ profile, t }: { profile: PrinterProfile; t: T }) { return profile.assignments.length ? <div className="space-y-2">{profile.assignments.slice(0,2).map(row => <div key={row.id} dir="auto"><span className="font-medium">{row.device_name || row.device_id}</span><span className="block text-fs-xs text-[var(--fg-muted)]">{row.printer_name || row.printer_id}</span></div>)}{profile.assignments.length > 2 && <p>+{profile.assignments.length - 2}</p>}</div> : <span className="text-[var(--fg-muted)]">{t('printerProfileNoPrinter')}</span>; }

function ProfileMenu({ profile, disabled, t, onEdit, onDuplicate, onAssignments, onDelete }: { profile: PrinterProfile; disabled: boolean; t: T; onEdit: (profile: PrinterProfile) => void; onDuplicate: (profile: PrinterProfile) => void; onAssignments: (profile: PrinterProfile) => void; onDelete: (profile: PrinterProfile) => void }) {
  return <Menu><MenuTrigger asChild><Button disabled={disabled} variant="ghost" size="sm" icon aria-label={`${t('actions')} · ${profile.name}`}><MoreHorizontal /></Button></MenuTrigger><MenuContent align="end"><MenuItem onSelect={() => onEdit(profile)}><Pencil />{t('printerProfileEdit')}</MenuItem><MenuItem onSelect={() => onDuplicate(profile)}><Copy />{t('printerProfileDuplicate')}</MenuItem><MenuItem onSelect={() => onAssignments(profile)}><Printer />{t('printerProfileEditAssignments')}</MenuItem><MenuSeparator /><MenuItem danger onSelect={() => onDelete(profile)}><Trash2 />{t('printerProfileDelete')}</MenuItem></MenuContent></Menu>;
}
function ProfileDrawer({ profile, categories, canEdit, closeDisabled, feedback, t, onClose, onEdit, onAssignments }: { profile: PrinterProfile | null; categories: PrinterProfileCategory[]; canEdit: boolean; closeDisabled: boolean; feedback: ReactNode; t: T; onClose: () => void; onEdit: (profile: PrinterProfile) => void; onAssignments: (profile: PrinterProfile) => void }) {
  return <Drawer open={!!profile} onOpenChange={open => { if (!open) onClose(); }} closeDisabled={closeDisabled} title={<span dir="auto" className="[overflow-wrap:anywhere]">{profile?.name}</span>} width={640} primaryAction={profile && canEdit ? <Button variant="secondary" size="sm" onClick={() => onEdit(profile)}><Pencil />{t('edit')}</Button> : undefined}>{profile && <div className="space-y-6">{feedback}<ProfileSnapshot profile={profile} categories={categories} t={t} />{canEdit && <Button variant="secondary" size="md" onClick={() => onAssignments(profile)}><Printer />{t('printerProfileEditAssignments')}</Button>}</div>}</Drawer>;
}
function ProfileSnapshot({ profile, categories, t }: { profile: PrinterProfile; categories: PrinterProfileCategory[]; t: T }) {
  const options: [string, string | boolean | number][] = [['printerProfileEnabled', profile.enabled], ['printerProfileAutoNewCategories', profile.auto_print_new_categories], ['printerProfileOneItemPerTicket', profile.one_item_per_ticket], ['printerProfileRecipientInfo', profile.print_recipient_information], ['printerProfileHideFooter', profile.hide_ticket_footer], ['printerProfilePrintKitchenNames', profile.print_kitchen_names], ['printerProfileCombineItems', profile.combine_identical_items], ['printerProfileTicketMargins', t(MARGIN_OPTIONS.find(row => row.value === profile.ticket_margins)!.label)], ['printerProfileTicketLayout', t(LAYOUT_OPTIONS.find(row => row.value === profile.ticket_layout)!.label)], ['printerProfileFontSize', t(FONT_SIZE_OPTIONS.find(row => row.value === profile.font_size)!.label)], ['printerProfileItemSort', t(SORT_OPTIONS.find(row => row.value === profile.item_sort_order)!.label)], ['printerProfileCopies', profile.copies]];
  return <div className="space-y-6 pt-3"><p className="text-fs-lg font-semibold [overflow-wrap:anywhere]" dir="auto">{profile.name}</p><DetailSection title={t('printerProfileTicketTypes')}><div className="space-y-3">{profile.job_types.map(type => { const job = JOB_TYPES.find(row => row.type === type)!; const Icon = job.icon; return <div key={type} className="flex gap-3"><Icon className="size-5 shrink-0" /><span>{t(job.title)}</span></div>; })}</div></DetailSection><DetailSection title={t('printerProfileDineInCategories')}><CategoryDetail ids={profile.dine_in_category_ids} categories={categories} t={t} /></DetailSection><DetailSection title={t('printerProfileOnlineCategories')}><CategoryDetail ids={profile.online_category_ids} categories={categories} t={t} /></DetailSection><DetailSection title={t('printerProfileCommonOptions')}><dl className="divide-y divide-[var(--line)]">{options.map(([label,value]) => <div key={label} className="flex items-start justify-between gap-5 py-3 text-fs-sm"><dt>{t(label)}</dt><dd className="shrink-0 font-semibold">{typeof value === 'boolean' ? t(value ? 'yes' : 'no') : value}</dd></div>)}</dl></DetailSection><DetailSection title={t('printerProfileAssociatedDevices')}><div className="space-y-3">{profile.assignments.length ? profile.assignments.map(row => <div key={row.id} className="rounded-r-md border border-[var(--line)] p-4 [overflow-wrap:anywhere]" dir="auto"><p className="font-semibold">{row.device_name || row.device_id}</p><p className="mt-1 text-fs-sm">{row.printer_name || row.printer_id}</p><p className="text-fs-xs text-[var(--fg-muted)]">{row.printer_model}</p></div>) : <p className="text-fs-sm text-[var(--fg-muted)]">{t('printerProfileNoPrinter')}</p>}</div></DetailSection></div>;
}
function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section><h3 className="mb-3 border-b border-[var(--line)] pb-3 text-fs-md font-semibold">{title}</h3>{children}</section>; }
function CategoryDetail({ ids, categories, t }: { ids: number[]; categories: PrinterProfileCategory[]; t: T }) { return ids.length ? <div className="flex flex-wrap gap-2">{ids.map(id => <span key={id} dir="auto" className="rounded-r-md bg-[var(--surface-2)] px-3 py-2 text-fs-sm [overflow-wrap:anywhere]">{categoryName(id,categories,t)}</span>)}</div> : <p className="text-fs-sm text-[var(--fg-muted)]">{t('printerProfileNoCategories')}</p>; }
function ProfileEditor({ editor, categories, saving, closeDisabled, frozen, dirty, feedback, nameRef, t, onChange, onSave, onAssign, onClose }: { editor: ProfileEditorState | null; categories: PrinterProfileCategory[]; saving: boolean; closeDisabled: boolean; frozen: boolean; dirty: boolean; feedback: ReactNode; nameRef: React.RefObject<HTMLInputElement>; t: T; onChange: (value: ProfileEditorState | null) => void; onSave: () => void; onAssign: () => void; onClose: () => void }) {
  if (!editor) return null;
  const toggleJob = (type: PrinterProfileJobType, checked: boolean) => onChange({ ...editor, job_types: checked ? [...editor.job_types, type] : editor.job_types.filter(value => value !== type) });
  const tickets = editor.job_types.some(type => type !== 'receipts');
  return <FullScreenEditor open title={t(editor.id ? 'printerProfileEdit' : 'printerProfileCreate')} saveLabel={t(saving ? 'saving' : 'save')} saveDisabled={frozen || !dirty || !editor.job_types.length || !editor.name.trim()} closeDisabled={closeDisabled} showCancel={false} initialFocusRef={nameRef} onOpenChange={open => { if (!open) onClose(); }} onSave={onSave}>
    <div className="mx-auto max-w-[840px] space-y-6">{feedback}<fieldset disabled={frozen} className="min-w-0 space-y-7"><Field label={t('printerProfileName')} grow><Input ref={nameRef} aria-label={t('printerProfileName')} value={editor.name} onChange={event => onChange({ ...editor, name: event.target.value })} placeholder={t('printerProfileNamePlaceholder')} dir="auto" /><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileNameHint')}</p></Field><section className="rounded-r-xl bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><h2 className="font-semibold">{t('printerProfileJobTypes')}</h2><p className="mt-2 text-fs-sm">{t('printerProfileJobTypesDesc')}</p></section><div className="divide-y divide-[var(--line)]">{JOB_TYPES.map(({type,title,desc,icon:Icon}) => <PrinterProfileJobSection key={type} type={type} title={t(title)} description={t(desc)} icon={Icon} active={editor.job_types.includes(type)} onToggle={checked => toggleJob(type,checked)}>{type === 'receipts' ? <p className="py-4 text-fs-sm text-[var(--fg-muted)]">{t('printerProfileReceiptCommonHint')}</p> : <CategorySelector ids={type === 'dine_in_tickets' ? editor.dine_in_category_ids : editor.online_category_ids} categories={categories} t={t} onChange={ids => onChange({ ...editor, [type === 'dine_in_tickets' ? 'dine_in_category_ids' : 'online_category_ids']: ids })} />}</PrinterProfileJobSection>)}</div>{!!editor.job_types.length && <section className="rounded-r-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"><h2 className="text-fs-lg font-semibold">{t('printerProfileCommonOptions')}</h2><p className="mt-2 text-fs-sm text-[var(--fg-muted)]">{t('printerProfileCommonHint')}</p><OptionRow checked={editor.print_recipient_information} label={t('printerProfileRecipientInfo')} onChange={checked => onChange({ ...editor, print_recipient_information: checked })} /><CopiesOption editor={editor} t={t} onChange={onChange} />{tickets && <TicketFormatOptions editor={editor} t={t} onChange={onChange} />}</section>}<OptionRow checked={editor.enabled} label={t('printerProfileEnabled')} onChange={checked => onChange({ ...editor, enabled: checked })} /></fieldset>{editor.id && <div className="border-t border-[var(--line)] pt-5"><Button variant="secondary" size="md" disabled={frozen} onClick={onAssign}><Printer />{t('printerProfileAssignPrinters')}</Button></div>}</div>
  </FullScreenEditor>;
}
function TicketFormatOptions({ editor, t, onChange }: { editor: ProfileEditorState; t: T; onChange: (value: ProfileEditorState) => void }) {
  return <div className="border-t border-[var(--line)]"><OptionRow checked={editor.auto_print_new_categories} label={t('printerProfileAutoNewCategories')} onChange={checked => onChange({ ...editor, auto_print_new_categories: checked })} /><OptionRow checked={editor.one_item_per_ticket} label={t('printerProfileOneItemPerTicket')} onChange={checked => onChange({ ...editor, one_item_per_ticket: checked })} /><OptionRow checked={editor.hide_ticket_footer} label={t('printerProfileHideFooter')} description={t('printerProfileHideFooterDesc')} onChange={checked => onChange({ ...editor, hide_ticket_footer: checked })} /><SelectOption label={t('printerProfileTicketMargins')} value={editor.ticket_margins} options={MARGIN_OPTIONS} t={t} onChange={value => onChange({ ...editor, ticket_margins: value as PrinterTicketMargins })} /><OptionRow checked={editor.print_kitchen_names} label={t('printerProfilePrintKitchenNames')} onChange={checked => onChange({ ...editor, print_kitchen_names: checked })} /><OptionRow checked={editor.combine_identical_items} label={t('printerProfileCombineItems')} onChange={checked => onChange({ ...editor, combine_identical_items: checked })} /><SelectOption label={t('printerProfileTicketLayout')} value={editor.ticket_layout} options={LAYOUT_OPTIONS} t={t} onChange={value => onChange({ ...editor, ticket_layout: value as PrinterTicketLayout })} /><SelectOption label={t('printerProfileFontSize')} value={editor.font_size} options={FONT_SIZE_OPTIONS} t={t} onChange={value => onChange({ ...editor, font_size: value as PrinterTicketFontSize })} /><SelectOption label={t('printerProfileItemSort')} value={editor.item_sort_order} options={SORT_OPTIONS} t={t} onChange={value => onChange({ ...editor, item_sort_order: value as PrinterItemSortOrder })} /></div>;
}
function CopiesOption({ editor, t, onChange }: { editor: ProfileEditorState; t: T; onChange: (value: ProfileEditorState) => void }) { return <div className="flex flex-wrap items-center justify-between gap-3 py-4"><span className="text-fs-sm font-semibold">{t('printerProfileCopies')}</span><div className="flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] p-1"><Button variant="ghost" size="sm" icon aria-label={t('decrease')} disabled={editor.copies <= 1} onClick={() => onChange({ ...editor, copies: editor.copies - 1 })}><Minus /></Button><output className="min-w-8 text-center text-fs-sm font-semibold tabular-nums" aria-label={t('printerProfileCopies')}>{editor.copies}</output><Button variant="ghost" size="sm" icon aria-label={t('increase')} disabled={editor.copies >= 5} onClick={() => onChange({ ...editor, copies: editor.copies + 1 })}><Plus /></Button></div></div>; }
function CategorySelector({ ids, categories, t, onChange }: { ids: number[]; categories: PrinterProfileCategory[]; t: T; onChange: (ids: number[]) => void }) {
  const unknown = ids.filter(id => !categories.some(row => row.id === id));
  const allSelected = categories.length > 0 && categories.every(row => ids.includes(row.id));
  const rows = [...categories, ...unknown.map(id => ({ id, name: categoryName(id,categories,t) }))];
  return <details className="py-4"><summary className="cursor-pointer text-fs-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]">{t('printerProfileCategoriesToPrint')} · {ids.length} {t('printerProfileSelected')}</summary><div className="mt-4 space-y-4">{!!unknown.length && <p className="text-fs-xs text-[var(--fg-muted)]">{t('printerProfileUnknownCategoriesHint')}</p>}<label className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 text-fs-sm font-semibold"><span>{t('selectAll')}</span><Checkbox disabled={!categories.length} checked={allSelected} onCheckedChange={checked => onChange(checked ? Array.from(new Set([...ids,...categories.map(row => row.id)])) : unknown)} /></label><div className="grid gap-4 sm:grid-cols-2">{rows.map(row => <label key={row.id} className="flex items-start justify-between gap-3 text-fs-sm"><span dir="auto" className="[overflow-wrap:anywhere]">{row.name}</span><Checkbox checked={ids.includes(row.id)} onCheckedChange={checked => onChange(checked ? [...ids,row.id] : ids.filter(id => id !== row.id))} /></label>)}</div>{!rows.length && <p className="text-fs-xs">{t('printerProfileNoCategories')}</p>}</div></details>;
}
function OptionRow({ checked, label, description, onChange }: { checked: boolean; label: string; description?: string; onChange: (checked: boolean) => void }) { return <label className="flex items-start justify-between gap-5 border-b border-[var(--line)] py-4"><span><span className="block text-fs-sm font-semibold">{label}</span>{description && <span className="mt-1 block max-w-[62ch] text-fs-xs leading-relaxed text-[var(--fg-muted)]">{description}</span>}</span><Checkbox checked={checked} onCheckedChange={value => onChange(value === true)} /></label>; }
function SelectOption({ label, value, options, t, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; t: T; onChange: (value: string) => void }) { return <div className="border-b border-[var(--line)] py-4"><Field label={label} grow><Select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</Select></Field></div>; }
function AssignmentEditor({ profile, agents, printers, assignments, saving, closeDisabled, frozen, dirty, feedback, t, onChange, onSave, onClose }: { profile: PrinterProfile | null; agents: PrintAgent[]; printers: PrinterConfiguration[]; assignments: Record<string,string>; saving: boolean; closeDisabled: boolean; frozen: boolean; dirty: boolean; feedback: ReactNode; t: T; onChange: (value: Record<string,string>) => void; onSave: () => void; onClose: () => void }) {
  if (!profile) return null;
  const missing = profile.assignments.filter(row => !agents.some(agent => agent.spooler_id === row.device_id));
  return <FullScreenEditor open title={t('printerProfileAssignTitle')} subtitle={profile.name} saveLabel={t(saving ? 'saving' : 'save')} saveDisabled={frozen || !dirty} closeDisabled={closeDisabled} showCancel={false} onOpenChange={open => { if (!open) onClose(); }} onSave={onSave}><div className="mx-auto max-w-[840px] space-y-6">{feedback}<div className="rounded-r-xl bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><p className="font-semibold [overflow-wrap:anywhere]" dir="auto">{profile.name}</p><p className="mt-2 text-fs-sm">{t('printerProfileAssignDesc')}</p></div><fieldset disabled={frozen} className="min-w-0 space-y-4">{agents.map(device => {
    const available = printers.filter(printer => device.printer_ids.includes(printer.id));
    const selectedId = assignments[device.spooler_id] ?? '';
    const original = profile.assignments.find(row => row.device_id === device.spooler_id);
    const unavailable = selectedId && !available.some(row => row.id === selectedId);
    return <section key={device.spooler_id} className="rounded-r-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"><div className="mb-4 flex gap-3"><Smartphone className="size-5 shrink-0" /><div className="min-w-0"><h2 className="font-semibold [overflow-wrap:anywhere]" dir="auto">{device.name}</h2><p className="text-fs-xs text-[var(--fg-muted)] [overflow-wrap:anywhere]" dir="auto">{device.model || device.spooler_id}</p></div></div><Field label={`${t('printers')} · ${device.name}`} grow><Select value={selectedId} onChange={event => onChange({ ...assignments,[device.spooler_id]:event.target.value })}><option value="">{t('printerProfileNoPrinter')}</option>{unavailable && <option value={selectedId}>{t('printerProfileUnavailable')} · {original?.printer_name || selectedId}</option>}{available.map(printer => <option key={printer.id} value={printer.id}>{printer.name} · {printer.model}</option>)}</Select></Field>{unavailable && <p className="mt-3 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileUnavailablePrinterHint')}</p>}{!available.length && <p className="mt-3 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileNoDiscoveredPrinters')}</p>}</section>;
  })}{missing.map(row => <section key={row.device_id} className="rounded-r-xl border border-[var(--line)] p-4"><h2 className="font-semibold [overflow-wrap:anywhere]" dir="auto">{row.device_name || row.device_id}</h2><p className="mt-2 text-fs-sm [overflow-wrap:anywhere]" dir="auto">{row.printer_name || row.printer_id}</p><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{t('printerProfileMissingAgentHint')}</p><Button variant="secondary" size="sm" className="mt-4" onClick={() => onChange({ ...assignments,[row.device_id]:assignments[row.device_id] ? '' : row.printer_id })}>{t(assignments[row.device_id] ? 'printerProfileRemoveAssignment' : 'printerProfileRestoreAssignment')}</Button></section>)}</fieldset>{!agents.length && <p className="text-fs-sm text-[var(--fg-muted)]">{t('printerProfileAgentsAppearHint')}</p>}</div></FullScreenEditor>;
}
function jobTypeLabel(type: PrinterProfileJobType, t: T) { return t(JOB_TYPES.find(job => job.type === type)?.title ?? type); }
function categoryName(id: number, categories: PrinterProfileCategory[], t: T) { return categories.find(row => row.id === id)?.name ?? t('printerProfileUnknownCategory').replace('{id}',String(id)); }
function categorySummary(profile: PrinterProfile, categories: PrinterProfileCategory[], t: T) { const ids = Array.from(new Set([...(profile.job_types.includes('dine_in_tickets') ? profile.dine_in_category_ids : []), ...(profile.job_types.includes('online_tickets') ? profile.online_category_ids : [])])); return ids.length ? ids.map(id => categoryName(id,categories,t)).join(', ') : t('printerProfileNoCategories'); }
function Feedback({ tone, text }: { tone: 'success' | 'danger'; text: string }) { return <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-r-md p-4 text-fs-sm leading-relaxed ${tone === 'success' ? 'bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'bg-[var(--danger-50)] text-[var(--danger-500)]'}`}><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{text}</span></div>; }
