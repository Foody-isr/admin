'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHead, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  getChainBranches,
  ensureChain,
  createChainBranch,
  updateChainBranch,
  updateChainPublication,
  resendStaffInvite,
  ChainOverview,
  ChainBranch,
  EnsureChainInput,
} from '@/lib/api';
import { PlusIcon, ExternalLinkIcon, NetworkIcon, ShieldCheckIcon, MapPinIcon, MailIcon, ClockIcon, CheckIcon } from 'lucide-react';

/**
 * Branch management — the top-level "Succursales" surface (moved out of catering).
 * Lists every branch of the chain and lets the chain owner create a new branch
 * (its own restaurant), optionally seeding a branch manager via the existing
 * staff-invite flow against the freshly created branch.
 */
export default function ChainBranchesPage() {
  const { restaurantId: ridParam } = useParams();
  const restaurantId = Number(ridParam);
  const router = useRouter();
  const { t } = useI18n();
  const { isOwner, hasPermission } = usePermissions();
  const canManage = isOwner || hasPermission('chain.manage');

  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [busyBranch, setBusyBranch] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getChainBranches(restaurantId)
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const branches = overview?.branches ?? [];
  const hasChain = overview?.chain_id != null;
  const needsPublicIdentity = !hasChain || !overview?.chain_slug;

  return (
    <div className="space-y-6">
      <PageHead
        title={t('chain_branches')}
        desc={t('chain_branches_desc')}
        actions={
          canManage && hasChain && !needsPublicIdentity && (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {t('chain_create_branch')}
            </Button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : needsPublicIdentity ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="grid gap-8 p-6 md:grid-cols-[1.2fr_.8fr] md:p-10">
            <div>
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-500">
                <NetworkIcon className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-[-.02em] text-fg-primary">
                {t('chain_brand_setup_title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-secondary">
                {t('chain_brand_setup_desc')}
              </p>
              {canManage && (
                <Button variant="primary" size="md" className="mt-6" onClick={() => setSetupOpen(true)}>
                  {t('chain_create_brand')}
                </Button>
              )}
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success-500)]" />
                <p className="text-sm leading-6 text-fg-secondary">{t('chain_setup_preserves')}</p>
              </div>
              <div className="mt-5 border-t border-[var(--line)] pt-4 text-sm">
                <p className="font-semibold text-fg-primary">{branches[0]?.name}</p>
                <p className="mt-1 text-fg-tertiary">{branches[0]?.address}</p>
              </div>
            </div>
          </div>
        </div>
      ) : branches.length === 0 ? (
        <div className="card p-8 text-center text-fg-secondary">{t('chain_no_branches')}</div>
      ) : (
        <div className="space-y-4">
          {overview?.chain_slug && (
            <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${overview.public_enabled ? 'border-[var(--success-500)]/30 bg-[color-mix(in_oklab,var(--success-500)_7%,transparent)]' : 'border-[var(--line)] bg-[var(--surface-2)]'}`}>
              <div>
                <p className="font-semibold text-fg-primary">{overview.public_enabled ? t('chain_global_live') : t('chain_global_disabled')}</p>
                <p className="mt-1 text-sm text-fg-secondary">{overview.public_enabled ? t('chain_global_live_desc') : t('chain_global_disabled_desc')}</p>
                {overview.public_enabled && (
                  <a href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/c/${overview.chain_slug}/order`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
                    {t('chain_public_page')} <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
              {canManage && (
                <button type="button" disabled={busyBranch === 0} onClick={async () => {
                  setBusyBranch(0); setActionMessage('');
                  try { await updateChainPublication(restaurantId, !overview.public_enabled); load(); }
                  catch (error) { setActionMessage(error instanceof Error ? error.message : t('chain_action_failed')); }
                  finally { setBusyBranch(null); }
                }} className={overview.public_enabled ? 'btn-secondary whitespace-nowrap' : 'btn-primary whitespace-nowrap'}>
                  {overview.public_enabled ? t('chain_disable_global') : t('chain_activate_global')}
                </button>
              )}
            </div>
          )}
          {actionMessage && (
            <div role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-fg-secondary">
              {actionMessage}
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {branches.map((b) => {
              const checklist = b.publication_checklist;
              const checks = [
                ['access', checklist?.access], ['contact', checklist?.contact],
                ['catalog', checklist?.catalog], ['hours', checklist?.hours],
                ['order_mode', checklist?.order_mode], ['payment', checklist?.payment],
                ['branding', checklist?.branding],
              ] as const;
              const statusLabel = !b.is_active
                ? t('chain_inactive_badge')
                : b.listing_status === 'live' ? t('chain_live_badge')
                  : b.listing_status === 'hidden' ? t('chain_hidden_badge') : t('chain_setup_badge');
              const webBase = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';
              return (
                <article key={b.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="p-5 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-xl font-semibold tracking-[-.02em] text-fg-primary">{b.public_name || b.name}</h2>
                          {b.is_current && <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-fs-xs font-semibold text-brand-500">{t('chain_current_badge')}</span>}
                        </div>
                        <p className="mt-1 font-mono text-xs text-fg-tertiary">/r/{b.slug}/order</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-fs-xs font-semibold ${b.listing_status === 'live' && b.is_active ? 'bg-[var(--success-500)]/15 text-[var(--success-500)]' : 'bg-fg-tertiary/10 text-fg-tertiary'}`}>{statusLabel}</span>
                    </div>

                    <div className="mt-5 grid grid-cols-7 gap-1" aria-label={t('chain_readiness')}>
                      {checks.map(([key, done]) => <div key={key} className={`h-1.5 rounded-full ${done ? 'bg-[var(--success-500)]' : 'bg-fg-tertiary/15'}`} />)}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg-primary">{t('chain_readiness')}</span>
                      <span className="text-fg-tertiary">{checklist?.completed ?? 0}/{checklist?.total ?? 7}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                      {checks.map(([key, done]) => (
                        <div key={key} className={`flex items-center gap-1.5 text-xs ${done ? 'text-fg-secondary' : 'text-fg-tertiary'}`}>
                          <span className={`grid h-4 w-4 place-items-center rounded-full ${done ? 'bg-[var(--success-500)] text-white' : 'border border-[var(--line)]'}`}>{done && <CheckIcon className="h-3 w-3" />}</span>
                          {t(`chain_check_${key}`)}
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 text-sm sm:grid-cols-2">
                      <div className="space-y-2 text-fg-secondary">
                        <p className="flex items-start gap-2"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-tertiary" />{b.address || t('chain_missing_address')}</p>
                        <p className="flex items-start gap-2"><ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-tertiary" />{b.opening_hours || t('chain_hours_configured')}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-fg-primary">{b.manager?.full_name || t('chain_no_manager')}</p>
                        <p className="mt-1 text-xs text-fg-tertiary">{b.manager?.email}</p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-fg-tertiary">
                          {[b.pickup_enabled && t('chain_mode_pickup'), b.delivery_enabled && t('chain_mode_delivery'), b.dine_in_enabled && t('chain_mode_dine_in')].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-5 py-3">
                    <button type="button" onClick={() => router.push(`/${b.id}/dashboard`)} className="rounded-lg px-3 py-2 text-xs font-semibold text-fg-primary hover:bg-fg-tertiary/10">{t('chain_open_admin')}</button>
                    <a href={`${webBase}/r/${b.slug}/order`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-fg-primary hover:bg-fg-tertiary/10">{t('chain_open_site')}<ExternalLinkIcon className="h-3.5 w-3.5" /></a>
                    {canManage && b.manager && (
                      <button type="button" disabled={busyBranch === b.id} onClick={async () => {
                        setBusyBranch(b.id); setActionMessage('');
                        try { const status = await resendStaffInvite(b.id, b.manager!.user_id); setActionMessage(t(`chain_invite_${status}`)); }
                        catch { setActionMessage(t('chain_invite_failed')); }
                        finally { setBusyBranch(null); }
                      }} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-fg-secondary hover:bg-fg-tertiary/10 disabled:opacity-50"><MailIcon className="h-3.5 w-3.5" />{t('chain_resend_invite')}</button>
                    )}
                    {canManage && b.is_active && b.listing_status !== 'archived' && (
                      <button type="button" disabled={busyBranch === b.id || (b.listing_status !== 'live' && !checklist?.ready)} title={b.listing_status !== 'live' && !checklist?.ready ? t('chain_complete_before_publish') : undefined} onClick={async () => {
                        setBusyBranch(b.id); setActionMessage('');
                        try { await updateChainBranch(restaurantId, b.id, { listing_status: b.listing_status === 'live' ? 'hidden' : 'live' }); load(); }
                        catch (error) { setActionMessage(error instanceof Error ? error.message : t('chain_action_failed')); }
                        finally { setBusyBranch(null); }
                      }} className="ms-auto rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40">
                        {b.listing_status === 'live' ? t('chain_hide') : t('chain_publish')}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {setupOpen && (
        <CreateChainModal
          restaurantName={branches[0]?.name || ''}
          onClose={() => setSetupOpen(false)}
          onCreate={async (input) => {
            await ensureChain(restaurantId, input);
            setSetupOpen(false);
            load();
          }}
        />
      )}

      {addOpen && (
        <CreateBranchModal
          restaurantId={restaurantId}
          sourceBranches={branches}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateChainModal({
  restaurantName,
  onClose,
  onCreate,
}: {
  restaurantName: string;
  onClose: () => void;
  onCreate: (input: EnsureChainInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(restaurantName);
  const [slug, setSlug] = useState(slugify(restaurantName));
  const [branchName, setBranchName] = useState(restaurantName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setSaving(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        slug: slug.trim() || undefined,
        primary_branch_name: branchName.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chain_create_error'));
      setSaving(false);
    }
  }

  return (
    <Modal title={t('chain_create_brand')} onClose={onClose}>
      <WizardProgress labels={[t('chain_brand_name'), t('chain_review')]} step={step} />
      {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {step === 0 ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">{t('chain_brand_name')}</label>
            <input
              autoFocus
              required
              className="input"
              value={name}
              onChange={(event) => {
                const previousGenerated = slug === slugify(name);
                setName(event.target.value);
                if (previousGenerated) setSlug(slugify(event.target.value));
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">{t('chain_brand_slug')}</label>
            <div className="flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-brand-500">
              <span className="ps-3 text-sm text-fg-tertiary">/c/</span>
              <input className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm outline-none" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} />
              <span className="pe-3 text-sm text-fg-tertiary">/order</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">{t('chain_primary_branch_name')}</label>
            <input required className="input" value={branchName} onChange={(event) => setBranchName(event.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <p className="text-fs-xs font-semibold uppercase tracking-wide text-fg-tertiary">{t('chain_brand_name')}</p>
            <p className="mt-1 text-lg font-semibold text-fg-primary">{name}</p>
            <p className="mt-3 font-mono text-sm text-brand-500">/c/{slug}/order</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-4">
            <p className="text-fs-xs font-semibold uppercase tracking-wide text-fg-tertiary">{t('chain_primary_branch_name')}</p>
            <p className="mt-1 font-medium text-fg-primary">{branchName}</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-[color-mix(in_oklab,var(--success-500)_9%,transparent)] p-4">
            <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success-500)]" />
            <p className="text-sm leading-6 text-fg-secondary">{t('chain_setup_preserves')}</p>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-between gap-2">
        <button type="button" className="btn-secondary" onClick={step === 0 ? onClose : () => setStep(0)}>
          {step === 0 ? t('cancel') : t('chain_previous')}
        </button>
        {step === 0 ? (
          <button type="button" disabled={!name.trim() || !branchName.trim()} className="btn-primary disabled:opacity-50" onClick={() => setStep(1)}>
            {t('chain_next')}
          </button>
        ) : (
          <button type="button" disabled={saving} className="btn-primary disabled:opacity-50" onClick={create}>
            {saving ? t('chain_creating') : t('chain_create_brand_action')}
          </button>
        )}
      </div>
    </Modal>
  );
}

function CreateBranchModal({
  restaurantId,
  sourceBranches,
  onClose,
  onCreated,
}: {
  restaurantId: number;
  sourceBranches: ChainBranch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [catalogSourceId, setCatalogSourceId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createChainBranch(restaurantId, {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        manager_name: managerName.trim() || undefined,
        manager_email: managerEmail.trim() || undefined,
        manager_phone: managerPhone.trim() || undefined,
        catalog_source_restaurant_id: catalogSourceId || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chain_create_error'));
      setSaving(false);
    }
  }

  return (
    <Modal title={t('chain_create_branch')} onClose={onClose}>
      <WizardProgress
        labels={[t('chain_branch_details_step'), t('chain_catalog_step'), t('chain_manager_step'), t('chain_review_step')]}
        step={step}
      />
      {error && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_name')}</label>
              <input autoFocus required className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_address')}</label>
              <input required className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_phone')}</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-fg-primary">{t('chain_catalog_choice')}</p>
              <p className="mt-1 text-fs-xs leading-5 text-fg-tertiary">{t('chain_catalog_snapshot_hint')}</p>
            </div>
            <label className={`block cursor-pointer rounded-xl border p-4 transition ${catalogSourceId === null ? 'border-brand-500 bg-brand-500/8' : 'border-[var(--line)] hover:border-[var(--line-strong)]'}`}>
              <input type="radio" className="sr-only" checked={catalogSourceId === null} onChange={() => setCatalogSourceId(null)} />
              <span className="font-semibold text-fg-primary">{t('chain_catalog_empty')}</span>
              <span className="mt-1 block text-xs text-fg-tertiary">{t('chain_catalog_empty_desc')}</span>
            </label>
            {sourceBranches.filter((branch) => branch.is_active).map((branch) => (
              <label key={branch.id} className={`block cursor-pointer rounded-xl border p-4 transition ${catalogSourceId === branch.id ? 'border-brand-500 bg-brand-500/8' : 'border-[var(--line)] hover:border-[var(--line-strong)]'}`}>
                <input type="radio" className="sr-only" checked={catalogSourceId === branch.id} onChange={() => setCatalogSourceId(branch.id)} />
                <span className="font-semibold text-fg-primary">{t('chain_catalog_copy_from')} {branch.public_name || branch.name}</span>
                <span className="mt-1 block text-xs text-fg-tertiary">{branch.address}</span>
              </label>
            ))}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs leading-5 text-fg-secondary">
              {t('chain_catalog_excludes')}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm font-medium text-fg-secondary">{t('chain_manager_optional')}</p>
            <p className="text-fs-xs text-fg-tertiary mb-3">{t('chain_manager_hint')}</p>
            <div className="space-y-3">
            <input
              autoFocus
              className="input"
              placeholder={t('chain_manager_name')}
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />
            <input
              type="email"
              className="input"
              placeholder={t('chain_manager_email')}
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
            />
              <input
                className="input"
                placeholder={t('chain_branch_phone')}
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <p className="text-lg font-semibold text-fg-primary">{name}</p>
              <p className="mt-1 text-sm text-fg-secondary">{address}</p>
              {phone && <p className="mt-1 text-sm text-fg-tertiary">{phone}</p>}
            </div>
            {managerEmail && (
              <div className="rounded-xl border border-[var(--line)] p-4">
                <p className="text-fs-xs font-semibold uppercase tracking-wide text-fg-tertiary">{t('chain_manager_optional')}</p>
                <p className="mt-1 font-medium text-fg-primary">{managerName || managerEmail}</p>
                <p className="text-sm text-fg-secondary">{managerEmail}</p>
              </div>
            )}
            <div className="rounded-xl bg-brand-500/8 p-4 text-sm leading-6 text-fg-secondary">
              <p className="font-semibold text-fg-primary">{catalogSourceId ? t('chain_catalog_snapshot_selected') : t('chain_catalog_empty')}</p>
              <p className="mt-1">{catalogSourceId ? t('chain_catalog_independent_after_copy') : t('chain_catalog_independent')}</p>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={step === 0 ? onClose : () => setStep((value) => value - 1)}>
            {step === 0 ? t('cancel') : t('chain_previous')}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 0 && (!name.trim() || !address.trim())}
              className="btn-primary disabled:opacity-50"
              onClick={() => setStep((value) => value + 1)}
            >
              {t('chain_next')}
            </button>
          ) : (
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? t('chain_creating') : t('chain_create_branch')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function WizardProgress({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol className="mb-6 flex items-start gap-2" aria-label="Progress">
      {labels.map((label, index) => (
        <li key={label} className="min-w-0 flex-1">
          <div className={`h-1 rounded-full ${index <= step ? 'bg-brand-500' : 'bg-[var(--line)]'}`} />
          <p className={`mt-2 truncate text-fs-xs ${index === step ? 'font-semibold text-fg-primary' : 'text-fg-tertiary'}`}>
            {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
