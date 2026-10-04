'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHead, Button, EmptyState, ConfirmDialog } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { isChainReportOverview } from '@/lib/chain-report';
import { getChainBranches, ensureChain, updateChain, createChainBranch, updateChainBranch, updateChainPublication, resendStaffInvite, type ChainOverview, type ChainBranch, type EnsureChainInput, type UpdateChainInput, type CreateBranchInput } from '@/lib/api';
import { Plus, ExternalLink, Network, ShieldCheck, MapPin, Clock, Check, Pencil, Mail, RefreshCw, Store } from 'lucide-react';

type BranchInput = Parameters<typeof updateChainBranch>[2];
type Editor = { kind: 'chain' } | { kind: 'branch'; branch: ChainBranch } | { kind: 'setup' } | { kind: 'create' };
const webBase = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

/** Restaurant-scoped chain management; changing restaurants discards stale request state. */
export default function ChainBranchesPage() {
  const { restaurantId } = useParams();
  return <BranchManagement key={String(restaurantId)} restaurantId={Number(restaurantId)} />;
}

function BranchManagement({ restaurantId }: { restaurantId: number }) {
  const { t } = useI18n();
  const { roleName, loading: permissionsLoading } = usePermissions();
  // Chain identity and publication endpoints additionally require the actual owner.
  const canManage = roleName === 'Owner';
  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(false);
    try {
      const result = await getChainBranches(restaurantId);
      if (!result || !(result.chain_id === null || Number.isSafeInteger(result.chain_id) && result.chain_id > 0) || !isChainReportOverview(result, result.chain_id) || result.branches.length > 0 && !result.branches.some(branch => branch.id === restaurantId)) throw new Error('Invalid chain overview');
      if (mounted.current && request === sequence.current) setOverview(result);
      return result;
    } catch {
      if (mounted.current && request === sequence.current) { setError(true); setOverview(null); }
      return null;
    } finally { if (mounted.current && request === sequence.current) setLoading(false); }
  }, [restaurantId]);
  useEffect(() => { void load(); }, [load]);

  async function mutate<T>(work: () => Promise<T>): Promise<T> {
    if (lock.current || !canManage || permissionsLoading) throw new Error(t('chain_action_failed'));
    lock.current = true; setBusy(true); setMessage('');
    try { return await work(); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function saved() { if (!mounted.current) return; setEditor(null); setMessage(t('chain_saved')); void load(); }
  async function toggle(work: () => Promise<unknown>) {
    if (lock.current || !canManage) return;
    try { await mutate(work); setMessage(t('chain_saved')); }
    catch { if (mounted.current) setMessage(t('chain_update_uncertain')); }
    if (mounted.current) await load();
  }
  const branches = overview?.branches ?? [];
  const needsIdentity = overview?.chain_id == null || !overview.chain_slug;
  const primary = branches.find(branch => branch.id === overview?.primary_restaurant_id);
  const readyToPublish = branches.some(branch => branch.is_active && branch.listing_status === 'live' && branch.publication_checklist?.ready);
  const frozen = busy || loading || permissionsLoading;

  return <div className="space-y-6">
    <PageHead title={t('chain_branches')} desc={t('chain_branches_desc')} actions={canManage && overview && !needsIdentity ? <Button disabled={frozen} onClick={() => setEditor({ kind: 'create' })}><Plus />{t('chain_create_branch')}</Button> : undefined} />
    {message && <div role="status" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-fs-sm text-[var(--fg-muted)]">{message}</div>}
    {loading ? <div role="status" className="py-16 text-center text-[var(--fg-muted)]">{t('loading')}</div>
      : error ? <div className="card px-5" role="alert"><EmptyState icon={<Network />} title={t('chain_load_error')} action={<Button variant="secondary" onClick={() => void load()}><RefreshCw />{t('retry')}</Button>} /></div>
      : <>
        {!canManage && !permissionsLoading && <p className="text-fs-sm text-[var(--fg-muted)]">{t('chain_owner_only')}</p>}
        {needsIdentity ? <section className="grid gap-7 rounded-r-xl border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-[1.2fr_1fr] md:p-8">
          <div><Network className="mb-5 size-7 text-[var(--brand-ink)]" aria-hidden /><h2 className="text-fs-2xl font-semibold tracking-tight">{t('chain_brand_setup_title')}</h2><p className="mt-3 text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('chain_brand_setup_desc')}</p>{canManage && <Button className="mt-6" disabled={frozen} onClick={() => setEditor({ kind: 'setup' })}>{t('chain_create_brand')}</Button>}</div>
          <div className="rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><ShieldCheck className="mb-3 size-5" aria-hidden /><p className="text-fs-sm leading-relaxed">{t('chain_setup_preserves')}</p><p className="mt-6 break-words font-semibold"><bdi>{branches.find(branch => branch.id === restaurantId)?.name}</bdi></p></div>
        </section> : <>
          <section className="rounded-r-xl border border-[var(--line)] bg-[var(--summary-bg)] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 text-fs-sm text-[var(--summary-fg)]">{t('chain_brand_name')}</p><h2 className="break-words text-fs-2xl font-semibold text-[var(--summary-fg)]"><bdi>{overview?.chain_name}</bdi></h2></div><span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-fs-xs font-medium text-[var(--fg)]">{t(overview?.public_enabled ? 'chain_global_live' : 'chain_global_disabled')}</span></div>
            <p className="mt-3 max-w-prose text-fs-sm text-[var(--summary-fg)]">{t(overview?.public_enabled ? 'chain_global_live_desc' : 'chain_global_disabled_desc')}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-fs-sm text-[var(--summary-fg)]">
              <span className="inline-flex min-w-0 items-center gap-2"><Store className="size-4 shrink-0" aria-hidden />{t('chain_primary_site')}: <bdi className="break-words font-medium">{primary?.public_name || primary?.name || '—'}</bdi></span>
              {primary?.slug && <a href={`${webBase}/r/${primary.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-r-md underline underline-offset-4"><bdi className="min-w-0 break-all">/r/{primary.slug}</bdi><ExternalLink className="size-4 shrink-0" aria-hidden /></a>}
              <bdi className="break-all text-fs-xs">/c/{overview?.chain_slug}/order</bdi>
            </div>
            {canManage && <div className="mt-5 flex flex-wrap gap-2"><Button variant="secondary" disabled={frozen} onClick={() => setEditor({ kind: 'chain' })}><Pencil />{t('chain_edit_brand')}</Button><Button variant={overview?.public_enabled ? 'secondary' : 'primary'} disabled={frozen || (!overview?.public_enabled && !readyToPublish)} onClick={() => void toggle(() => updateChainPublication(restaurantId, !overview?.public_enabled))}>{t(overview?.public_enabled ? 'chain_disable_global' : 'chain_activate_global')}</Button></div>}
            {canManage && !overview?.public_enabled && !readyToPublish && <p className="mt-3 text-fs-xs text-[var(--summary-fg)]">{t('chain_publication_requires_ready')}</p>}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-fs-sm text-[var(--fg-muted)]">{t(branches.length === 1 ? 'chain_branch_count_one' : 'chain_branch_count').replace('{n}', String(branches.length))}</p><Button variant="secondary" disabled={frozen} onClick={() => void load()}><RefreshCw />{t('refresh')}</Button></div>
          {branches.length === 0 ? <EmptyState icon={<Store />} title={t('chain_no_branches')} /> : <div className="grid gap-4 xl:grid-cols-2">{branches.map(branch => <BranchCard key={branch.id} branch={branch} canManage={canManage} frozen={frozen} onEdit={() => setEditor({ kind: 'branch', branch })} onPublish={() => void toggle(() => updateChainBranch(restaurantId, branch.id, { listing_status: branch.listing_status === 'live' ? 'hidden' : 'live' }))} onInvite={async () => {
            if (lock.current || !canManage || !branch.manager) return;
            try { const status = await mutate(() => resendStaffInvite(branch.id, branch.manager!.user_id)); if (mounted.current) setMessage(t(`chain_invite_${status}`)); }
            catch { if (mounted.current) setMessage(t('chain_invite_unconfirmed')); }
          }} />)}</div>}
        </>}
      </>}
    {editor && canManage && <ChainEditor key={editor.kind === 'branch' ? `branch:${editor.branch.id}` : editor.kind} editor={editor} overview={overview} restaurantId={restaurantId} busy={busy} onClose={() => setEditor(null)} onVerify={async () => { const fresh = await load(); if (!fresh) throw new Error(t('chain_load_error')); setMessage(t('chain_review_after_error')); return fresh; }} onResolved={() => { setEditor(null); setMessage(t('chain_verified')); }} onSave={async payload => {
      if (editor.kind === 'setup') await mutate(() => ensureChain(restaurantId, payload as EnsureChainInput));
      else if (editor.kind === 'chain') await mutate(() => updateChain(restaurantId, payload as UpdateChainInput));
      else if (editor.kind === 'branch') await mutate(() => updateChainBranch(restaurantId, editor.branch.id, payload as BranchInput));
      else await mutate(() => createChainBranch(restaurantId, payload as CreateBranchInput));
      saved();
    }} />}
  </div>;
}

function BranchCard({ branch: b, canManage, frozen, onEdit, onPublish, onInvite }: { branch: ChainBranch; canManage: boolean; frozen: boolean; onEdit: () => void; onPublish: () => void; onInvite: () => Promise<void> }) {
  const { t } = useI18n();
  const checklist = b.publication_checklist;
  const checks = ['access', 'contact', 'catalog', 'hours', 'order_mode', 'payment', 'branding'] as const;
  const readyCount = checklist ? checks.filter(key => checklist[key]).length : null;
  const status = !b.is_active ? 'chain_inactive_badge' : b.listing_status === 'live' ? 'chain_live_badge' : b.listing_status === 'hidden' ? 'chain_hidden_badge' : b.listing_status === 'archived' ? 'chain_archived_badge' : 'chain_setup_badge';
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-r-xl border border-[var(--line)] bg-[var(--surface)]">
    <div className="flex-1 space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-48"><h3 className="break-words text-fs-lg font-semibold"><bdi>{b.public_name || b.name}</bdi></h3>{b.slug && <p className="mt-1 break-all text-fs-xs text-[var(--fg-muted)]"><bdi>/r/{b.slug}/order</bdi></p>}</div><span className={`rounded-full px-2.5 py-1 text-fs-xs font-medium ${b.is_active && b.listing_status === 'live' ? 'bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'}`}>{t(status)}</span></div>
      {(b.is_primary || b.is_current) && <div className="flex flex-wrap gap-2 text-fs-xs font-medium text-[var(--fg-muted)]">{b.is_primary && <span>{t('chain_primary_badge')}</span>}{b.is_primary && b.is_current && <span aria-hidden>·</span>}{b.is_current && <span>{t('chain_current_badge')}</span>}</div>}
      <div className="grid gap-4 text-fs-sm sm:grid-cols-2"><div className="space-y-2 text-[var(--fg-muted)]"><p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /><bdi className="min-w-0 break-words">{b.address || t('chain_missing_address')}</bdi></p><p className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden /><bdi className="min-w-0 break-words">{b.opening_hours || t(checklist?.hours ? 'chain_hours_configured' : 'chain_hours_unknown')}</bdi></p></div><div className="min-w-0"><p className="break-words font-medium"><bdi>{b.manager?.full_name || t('chain_no_manager')}</bdi></p>{b.manager?.email && <p className="mt-1 break-all text-fs-xs text-[var(--fg-muted)]"><bdi>{b.manager.email}</bdi></p>}<p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{[b.pickup_enabled && t('chain_mode_pickup'), b.delivery_enabled && t('chain_mode_delivery'), b.dine_in_enabled && t('chain_mode_dine_in')].filter(Boolean).join(' · ') || t('chain_modes_none')}</p></div></div>
      <details className="border-t border-[var(--line)] pt-4"><summary className="min-h-11 cursor-pointer rounded-r-md text-fs-sm font-medium">{t('chain_readiness_title')} <span className="ms-2 tabular-nums text-[var(--fg-muted)]">{readyCount === null ? '—' : `${readyCount}/${checks.length}`}</span></summary>{checklist ? <ul className="mt-2 grid grid-cols-2 gap-3">{checks.map(key => <li key={key} className="flex items-center gap-2 text-fs-xs text-[var(--fg-muted)]"><span className={`grid size-5 shrink-0 place-items-center rounded-full ${checklist[key] ? 'bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'border border-[var(--line-strong)]'}`}><span className="sr-only">{t(checklist[key] ? 'chain_check_done' : 'chain_check_missing')}: </span>{checklist[key] && <Check className="size-3.5" aria-hidden />}</span>{t(`chain_check_${key}`)}</li>)}</ul> : <p className="text-fs-sm text-[var(--fg-muted)]">{t('chain_readiness_unknown')}</p>}</details>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] p-4">
      {canManage && <Button variant="ghost" disabled={frozen} onClick={onEdit}><Pencil />{t('edit')}</Button>}
      <Button variant="secondary" asChild><Link href={`/${b.id}/dashboard`}>{t('chain_open_admin')}</Link></Button>
      {b.slug && <Button variant="ghost" asChild><a href={`${webBase}/r/${b.slug}/order${b.is_primary ? `?branch_id=${b.id}` : ''}`} target="_blank" rel="noreferrer">{t('chain_open_site')}<ExternalLink /></a></Button>}
      {canManage && b.manager && <Button variant="ghost" disabled={frozen} onClick={() => void onInvite()}><Mail />{t('chain_resend_invite')}</Button>}
      {canManage && b.is_active && b.listing_status !== 'archived' && <div className="ms-auto"><Button variant={b.listing_status === 'live' ? 'secondary' : 'primary'} disabled={frozen || b.listing_status !== 'live' && !checklist?.ready} onClick={onPublish}>{t(b.listing_status === 'live' ? 'chain_hide' : 'chain_publish')}</Button></div>}
      {canManage && b.is_active && b.listing_status !== 'live' && !checklist?.ready && <p className="w-full text-fs-xs text-[var(--fg-muted)]">{t('chain_complete_before_publish')}</p>}
    </div>
  </article>;
}

function ChainEditor({ editor, overview, restaurantId, busy, onClose, onSave, onVerify, onResolved }: {
  editor: Editor; overview: ChainOverview | null; restaurantId: number; busy: boolean; onClose: () => void;
  onSave: (payload: EnsureChainInput | UpdateChainInput | BranchInput | CreateBranchInput) => Promise<void>;
  onVerify: () => Promise<ChainOverview>; onResolved: () => void;
}) {
  const { t } = useI18n();
  const [initialOverview] = useState(overview);
  const branch = editor.kind === 'branch' ? editor.branch : null;
  const current = initialOverview?.branches.find(row => row.id === restaurantId);
  const [initial] = useState(() => ({
    name: branch?.name ?? (editor.kind === 'chain' ? overview?.chain_name ?? '' : editor.kind === 'setup' ? current?.name ?? '' : ''),
    slug: branch?.slug ?? (overview?.chain_slug || (editor.kind === 'setup' ? slugify(current?.name ?? '') : '')),
    publicName: branch?.public_name || branch?.name || current?.name || '',
    address: branch?.address ?? '', phone: branch?.phone ?? '', description: branch?.short_description ?? '',
    primaryId: overview?.primary_restaurant_id || overview?.branches[0]?.id || 0,
    managerName: '', managerEmail: '', managerPhone: '', catalogSourceId: '',
  }));
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [verified, setVerified] = useState(false);
  const [working, setWorking] = useState(false);
  const [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const lastPayload = useRef<Record<string, unknown> | null>(null);
  const creating = editor.kind === 'create';
  const wizard = creating || editor.kind === 'setup';
  const lastStep = creating ? 3 : editor.kind === 'setup' ? 1 : 0;
  const frozen = working || busy;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const field = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  useEffect(() => {
    if (!dirty && !frozen && !uncertain) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, frozen, uncertain]);
  const close = () => { if (lock.current || frozen) return; if (dirty || uncertain) setDiscard(true); else onClose(); };
  const title = t(editor.kind === 'chain' ? 'chain_edit_brand' : editor.kind === 'branch' ? 'chain_edit_branch' : editor.kind === 'setup' ? 'chain_create_brand' : 'chain_create_branch');
  const steps = creating ? ['chain_branch_details_step', 'chain_catalog_step', 'chain_manager_step', 'chain_review_step'] : ['chain_brand_name', 'chain_review'];
  const textInput = (key: Exclude<keyof typeof draft, 'primaryId'>, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <EditorField label={t(label)} id={`chain-${key}`}><input id={`chain-${key}`} className="input" value={String(draft[key])} onChange={event => field(key, event.target.value)} {...extra} /></EditorField>;
  const identity = <>
    {textInput('name', editor.kind === 'branch' ? 'chain_internal_name' : 'chain_brand_name', { required: true, autoFocus: true, onChange: event => { const name = event.target.value; setDraft(previous => ({ ...previous, name, slug: editor.kind === 'setup' && previous.slug === slugify(previous.name) ? slugify(name) : previous.slug })); } })}
    {editor.kind === 'branch' && textInput('publicName', 'chain_public_name', { required: true })}
    <EditorField label={t(editor.kind === 'branch' ? 'chain_branch_url' : 'chain_brand_slug')} id="chain-slug"><div dir="ltr" className="flex items-center gap-1 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3"><span className="text-fs-sm text-[var(--fg-muted)]">/{editor.kind === 'branch' ? 'r' : 'c'}/</span><input id="chain-slug" required={editor.kind !== 'setup'} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="min-h-11 min-w-0 flex-1 bg-transparent text-fs-sm" value={draft.slug} onChange={event => field('slug', event.target.value)} onBlur={() => field('slug', slugify(draft.slug))} /><span className="text-fs-sm text-[var(--fg-muted)]">/order</span></div>{editor.kind === 'setup' && <p className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t('chain_slug_optional')}</p>}</EditorField>
    {editor.kind === 'setup' && textInput('publicName', 'chain_primary_branch_name', { required: true })}
    {editor.kind === 'chain' && <EditorField label={t('chain_primary_site')} id="chain-primary"><select id="chain-primary" required className="input" value={draft.primaryId} onChange={event => field('primaryId', Number(event.target.value))}>{initialOverview?.branches.map(row => <option key={row.id} value={row.id}>{row.public_name || row.name}</option>)}</select><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{t('chain_primary_site_hint')}</p></EditorField>}
  </>;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || frozen || uncertain) return;
    if (wizard && step < lastStep) { if (!draft.name.trim() || creating && step === 0 && !draft.address.trim() || editor.kind === 'setup' && !draft.publicName.trim()) return; setStep(step + 1); return; }
    if (!draft.name.trim() || creating && !draft.address.trim() || (editor.kind === 'branch' || editor.kind === 'setup') && !draft.publicName.trim()) return;
    const payload = editor.kind === 'chain' ? { name: draft.name.trim(), slug: slugify(draft.slug), primary_restaurant_id: draft.primaryId }
      : editor.kind === 'branch' ? { name: draft.name.trim(), public_name: draft.publicName.trim(), slug: slugify(draft.slug), address: draft.address.trim(), phone: draft.phone.trim(), short_description: draft.description.trim() }
      : editor.kind === 'setup' ? { name: draft.name.trim(), slug: slugify(draft.slug) || undefined, primary_branch_name: draft.publicName.trim() }
      : { name: draft.name.trim(), address: draft.address.trim(), phone: draft.phone.trim() || undefined, manager_name: draft.managerName.trim() || undefined, manager_email: draft.managerEmail.trim() || undefined, manager_phone: draft.managerPhone.trim() || undefined, catalog_source_restaurant_id: draft.catalogSourceId ? Number(draft.catalogSourceId) : undefined };
    if (!creating && editor.kind !== 'setup' && (!draft.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))) return;
    if (creating && draft.catalogSourceId && !initialOverview?.branches.some(row => row.id === Number(draft.catalogSourceId) && row.is_active)) { setError(t('chain_action_failed')); return; }
    lock.current = true; setWorking(true); setError(''); lastPayload.current = payload;
    try { await onSave(payload); }
    catch { setUncertain(true); setVerified(false); setError(t(creating ? 'chain_creation_uncertain' : 'chain_update_uncertain')); }
    finally { lock.current = false; setWorking(false); }
  }
  async function verify() {
    if (lock.current || frozen) return;
    lock.current = true; setWorking(true); setError('');
    try {
      const fresh = await onVerify();
      if (!creating) {
        const actual = editor.kind === 'branch' ? fresh.branches.find(row => row.id === editor.branch.id) : editor.kind === 'chain' ? { name: fresh.chain_name, slug: fresh.chain_slug, primary_restaurant_id: fresh.primary_restaurant_id } : { name: fresh.chain_name, slug: fresh.chain_slug, primary_branch_name: fresh.branches.find(row => row.id === restaurantId)?.public_name };
        if (actual && lastPayload.current && Object.entries(lastPayload.current).every(([key, value]) => value === undefined || ((actual as unknown as Record<string, unknown>)[key] ?? (['address', 'phone', 'short_description'].includes(key) ? '' : undefined)) === value)) { onResolved(); return; }
        setUncertain(false); setError(t('chain_saved_different'));
      } else { setVerified(true); setError(t('chain_creation_review')); }
    } catch { setError(t('chain_load_error')); }
    finally { lock.current = false; setWorking(false); }
  }
  return <>
    <Modal title={title} size="xl" closeDisabled={frozen} onClose={close}>
      {wizard && <ol aria-label={t('chain_wizard_progress')} className="mb-6 grid grid-cols-2 gap-3 sm:flex">{steps.map((key, index) => <li key={key} aria-current={index === step ? 'step' : undefined} className="min-w-0 flex-1"><div className={`mb-2 h-1 rounded-full ${index <= step ? 'bg-[var(--action)]' : 'bg-[var(--line)]'}`} /><span className={`text-fs-xs ${index === step ? 'font-semibold text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}>{t(key)}</span></li>)}</ol>}
      {error && <div role="alert" className="mb-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-fs-sm text-[var(--fg-muted)]">{error}</div>}
      <form ref={form} onSubmit={submit} className="space-y-5">
        <fieldset disabled={frozen || uncertain} className="min-w-0 space-y-4">
          {(editor.kind === 'branch' || editor.kind === 'chain' || editor.kind === 'setup' && step === 0) && identity}
          {(editor.kind === 'branch' || creating && step === 0) && <>
            {creating && textInput('name', 'chain_branch_name', { required: true, autoFocus: true })}
            {textInput('address', 'chain_branch_address', { required: creating })}
            {textInput('phone', 'chain_branch_phone', { type: 'tel', dir: 'ltr' })}
            {editor.kind === 'branch' && <EditorField label={t('chain_short_description')} id="chain-description"><textarea id="chain-description" className="input min-h-24 resize-y" value={draft.description} onChange={event => field('description', event.target.value)} /></EditorField>}
          </>}
          {creating && step === 1 && <>
            <p className="text-fs-sm text-[var(--fg-muted)]">{t('chain_catalog_snapshot_hint')}</p>
            <div role="radiogroup" aria-label={t('chain_catalog_choice')} className="space-y-3">{[{ id: '', name: t('chain_catalog_empty') }, ...(initialOverview?.branches.filter(row => row.is_active).map(row => ({ id: String(row.id), name: `${t('chain_catalog_copy_from')} ${row.public_name || row.name}` })) ?? [])].map(option => <label key={option.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-r-lg border p-4 text-fs-sm ${draft.catalogSourceId === option.id ? 'border-[var(--brand-ink)] bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'border-[var(--line)]'}`}><input type="radio" name="chain-catalog" value={option.id} checked={draft.catalogSourceId === option.id} onChange={() => field('catalogSourceId', option.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-ink)]" /><span className="min-w-0 break-words">{option.name}</span></label>)}</div><p className="text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('chain_catalog_excludes')}</p>
          </>}
          {creating && step === 2 && <><p className="text-fs-sm text-[var(--fg-muted)]">{t('chain_manager_hint')}</p>{textInput('managerName', 'chain_manager_name')}{textInput('managerEmail', 'chain_manager_email', { type: 'email', dir: 'ltr', required: !!draft.managerName.trim() || !!draft.managerPhone.trim() })}{textInput('managerPhone', 'chain_branch_phone', { type: 'tel', dir: 'ltr' })}</>}
          {wizard && step === lastStep && <>
            <div className="space-y-3 rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><p className="break-words text-fs-lg font-semibold"><bdi>{draft.name}</bdi></p>{creating ? <><p className="break-words text-fs-sm"><bdi>{draft.address}</bdi></p>{draft.phone && <p className="text-fs-sm"><bdi>{draft.phone}</bdi></p>}</> : <><p className="break-all text-fs-sm"><bdi>{draft.slug ? `/c/${draft.slug}/order` : t('chain_slug_optional')}</bdi></p><p className="text-fs-sm"><bdi>{draft.publicName}</bdi></p></>}</div>
            {creating && <><div className="rounded-r-lg border border-[var(--line)] p-4 text-fs-sm"><p className="font-medium">{t(draft.catalogSourceId ? 'chain_catalog_snapshot_selected' : 'chain_catalog_empty')}</p>{draft.catalogSourceId && <p className="mt-1 break-words"><bdi>{initialOverview?.branches.find(row => row.id === Number(draft.catalogSourceId))?.name}</bdi></p>}<p className="mt-2 text-[var(--fg-muted)]">{t(draft.catalogSourceId ? 'chain_catalog_independent_after_copy' : 'chain_catalog_independent')}</p></div>{draft.managerEmail && <div className="rounded-r-lg border border-[var(--line)] p-4 text-fs-sm"><p className="font-medium">{t('chain_manager_optional')}</p><p className="mt-2 break-words"><bdi>{draft.managerName}</bdi></p><p className="break-all"><bdi>{draft.managerEmail}</bdi></p><p className="mt-2 text-fs-xs text-[var(--fg-muted)]">{t('chain_manager_delivery_note')}</p></div>}</>}
            {!creating && <p className="text-fs-sm text-[var(--fg-muted)]">{t('chain_setup_preserves')}</p>}
          </>}
        </fieldset>
        <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" disabled={frozen} onClick={wizard && step > 0 && !uncertain ? () => setStep(step - 1) : close}>{t(wizard && step > 0 && !uncertain ? 'chain_previous' : 'cancel')}</Button>
          {uncertain ? <Button type="button" variant="secondary" disabled={frozen} onClick={() => verified && creating ? close() : void verify()}><RefreshCw />{t(verified && creating ? 'chain_return_list' : 'chain_verify_changes')}</Button>
            : <Button type="submit" disabled={frozen || !wizard && !dirty}>{t(frozen ? 'saving' : wizard && step < lastStep ? 'chain_next' : creating ? 'chain_create_branch' : editor.kind === 'setup' ? 'chain_create_brand_action' : 'save')}</Button>}
        </div>
      </form>
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} description={t(uncertain ? 'chain_close_uncertain' : 'discountDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { if (!frozen) { setDiscard(false); onClose(); } }} />
  </>;
}

function EditorField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-fs-sm font-medium">{label}</label>{children}</div>;
}

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
