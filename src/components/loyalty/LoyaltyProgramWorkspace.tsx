'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { ApiError, getLoyaltyProgram, getStoredUser, listAllItems, saveLoyaltyProgram, type LoyaltyProgramState, type MenuItem } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { clearProgramIntent, loyaltyLanguages, loyaltyProgramDraft, loyaltyProgramPayload, readProgramIntent, storeProgramIntent, type LoyaltyProgramDraft, type PendingLoyaltyProgram } from '@/lib/loyalty-program';
import { Badge, BooleanInput, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Field, Input, PageHead, Select, Textarea } from '@/components/ds';

/** Remount the form on restaurant/actor changes and remove data after cross-tab sign-out. */
export default function LoyaltyProgramWorkspace() {
  const { restaurantId } = useParams(); const { user } = useAuth(); const { t } = useI18n();
  const [actor, setActor] = useState<number | null>(null);
  useEffect(() => { const check = () => { try { setActor(getStoredUser()?.id ?? 0); } catch { setActor(0); } }; check(); window.addEventListener('storage', check); window.addEventListener('focus', check); return () => { window.removeEventListener('storage', check); window.removeEventListener('focus', check); }; }, [user?.id]);
  if (actor === null) return <p role="status">{t('loading')}</p>;
  if (!user?.id || actor !== user.id) return <p role="alert">{t('loyaltyProgramForbidden')}</p>;
  return <ProgramForm key={`${restaurantId}:${actor}`} rid={Number(restaurantId)} actor={actor} />;
}
const languageName = { en: 'English', fr: 'Français', he: 'עברית' };
const loadError = (error: unknown) => error instanceof ApiError && error.status === 403 ? 'loyaltyProgramForbidden' : error instanceof ApiError && error.status === 404 ? 'loyaltyProgramUnavailable' : 'loyaltyProgramLoadError';

function ProgramForm({ rid, actor }: { rid: number; actor: number }) {
  const { t } = useI18n();
  const [state, setState] = useState<LoyaltyProgramState | null>(null), [draft, setDraft] = useState<LoyaltyProgramDraft | null>(null);
  const [pending, setPending] = useState<PendingLoyaltyProgram | null>(null), [blocked, setBlocked] = useState(false), [rejected, setRejected] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'save' | 'refresh' | null>(null), [items, setItems] = useState<MenuItem[] | null>(null), [catalogError, setCatalogError] = useState(false), [catalogRevision, setCatalogRevision] = useState(0);
  const life = useRef({ alive: false, sequence: 0 }), lock = useRef(false), controller = useRef<AbortController | null>(null), baseline = useRef('');
  const load = useCallback(async (discardRejected = false) => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request; const sequence = ++life.current.sequence;
    const current = () => life.current.alive && sequence === life.current.sequence;
    setLoading(true); setError('');
    try {
      const latest = await getLoyaltyProgram(rid, request.signal); if (!current()) return;
      let saved = readProgramIntent(sessionStorage, rid, actor);
      if (discardRejected && saved) { clearProgramIntent(sessionStorage, saved); saved = null; setRejected(false); }
      setPending(saved); setState(latest);
      const next = loyaltyProgramDraft(saved ? saved.input : latest.program);
      setDraft(next); baseline.current = JSON.stringify(next);
    } catch (failure) { if (current() && !request.signal.aborted) { setState(null); if (failure instanceof Error && failure.message === 'loyalty_program_storage') setBlocked(true); else setError(loadError(failure)); } }
    finally { if (current()) setLoading(false); }
  }, [rid, actor]);
  useEffect(() => { const current = life.current; current.alive = true; void load(); return () => { current.alive = false; current.sequence++; controller.current?.abort(); }; }, [load]);
  const dirty = !!draft && JSON.stringify(draft) !== baseline.current;
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (lock.current || dirty && !pending) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, pending]);
  useEffect(() => { if (draft?.reward !== 'item' || items !== null) return; let alive = true; setCatalogError(false); void listAllItems(rid).then(data => { if (alive) setItems(data.filter(item => item.is_active && !item.combo_only && item.item_type !== 'combo' && item.pricing_mode !== 'by_weight')); }).catch(() => { if (alive) setCatalogError(true); }); return () => { alive = false; }; }, [rid, draft?.reward, items, catalogRevision]);
  const patch = (key: keyof LoyaltyProgramDraft, value: string | boolean) => setDraft(old => old ? { ...old, [key]: value } : old);
  const code = state?.program?.rules.currency ?? state?.restaurant_currency ?? '';
  let valid = false;
  if (draft && state) { try { loyaltyProgramPayload(draft, code, state.program?.revision ?? 0, '00000000-0000-4000-8000-000000000001', state.program?.id ?? null); valid = true; } catch { /* Incomplete fields keep Save disabled. */ } }
  const frozen = busy || loading || !!pending || blocked || !state?.can_manage_program;
  const selected = items?.find(item => String(item.id) === draft?.item);
  const options = selected?.option_sets?.filter(set => set.selection_role !== 'identity').flatMap(set => set.options ?? []).filter(option => option.is_active && !option.is_combo_only) ?? [];
  const submit = async () => {
    if (lock.current || !state?.can_manage_program || !draft || blocked || rejected || !pending && (!valid || !dirty)) return;
    try { if (getStoredUser()?.id !== actor) { setState(null); setError('loyaltyProgramForbidden'); return; } } catch { setState(null); setError('loyaltyProgramForbidden'); return; }
    lock.current = true; setBusy(true); setConfirm(null); setError(''); setNotice('');
    let saved: PendingLoyaltyProgram;
    try { saved = storeProgramIntent(sessionStorage, pending ?? { restaurant: rid, actor, program_id: state.program?.id ?? null, input: loyaltyProgramPayload(draft, code, state.program?.revision ?? 0, crypto.randomUUID(), state.program?.id ?? null) }); setPending(saved); }
    catch { lock.current = false; setBusy(false); setBlocked(true); return; }
    try {
      await saveLoyaltyProgram(saved); if (!life.current.alive) return;
      setNotice('loyaltyProgramSaved');
      try { clearProgramIntent(sessionStorage, saved); setPending(null); } catch { setBlocked(true); return; }
      setRejected(false); await load();
    } catch (failure) {
      if (!life.current.alive) return;
      if (failure instanceof ApiError && [400, 409, 413, 415, 422].includes(failure.status)) { setRejected(true); setError('loyaltyProgramRejected'); }
      else if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setState(null); setError('loyaltyProgramForbidden'); }
      else setError('loyaltyProgramUncertain');
    } finally { if (life.current.alive) { lock.current = false; setBusy(false); } }
  };
  return <div className="min-w-0 space-y-6 pb-20">
    <PageHead title={t('loyaltyProgramTitle')} desc={t('loyaltyProgramIntro')} actions={<Button variant="secondary" disabled={busy || loading} onClick={() => { if (dirty && !pending || rejected) setConfirm('refresh'); else void load(); }}><RefreshCw aria-hidden="true" />{t(rejected ? 'loyaltyProgramReview' : 'loyaltyCheckoutRefresh')}</Button>} />
    {error && <p role="alert" className="border-s-2 border-[var(--warning-500)] ps-4 text-sm leading-6">{t(error)}</p>}
    {notice && <p role="status" className="border-s-2 border-[var(--info-500)] ps-4 text-sm">{t(notice)}</p>}
    {blocked && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('loyaltyProgramStorage')}</p>}
    {loading && !state && <p role="status">{t('loading')}</p>}
    {state && draft && <>
      {!state.program && <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramNotConfigured')}</p>}
      {!state.can_manage_program && <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramReadOnly')}</p>}
      {state.identity_locked && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('loyaltyProgramIdentityLocked')}</p>}
      {!!pending && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('loyaltyProgramPending')}</p>}
      {code !== state.restaurant_currency && <p role="alert" className="text-sm">{t('loyaltyProgramCurrencyChanged')}</p>}
      <fieldset disabled={frozen} className="min-w-0 space-y-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>{t('loyaltyProgramEarn')}</CardTitle></CardHeader><CardBody className="space-y-4">
            <Field label={t('loyaltyProgramMode')}><Select aria-label={t('loyaltyProgramMode')} value={draft.mode} disabled={state.identity_locked} onChange={e => patch('mode', e.target.value)}><option value="points">{t('loyaltyProgramPoints')}</option><option value="visits">{t('loyaltyProgramVisits')}</option></Select></Field>
            {draft.mode === 'points' && <div className="grid grid-cols-2 gap-4"><Field label={`${t('loyaltyProgramSpend')} (${code})`}><Input inputMode="decimal" value={draft.step} onChange={e => patch('step', e.target.value)} /></Field><Field label={t('loyaltyProgramUnits')}><Input inputMode="numeric" value={draft.units} onChange={e => patch('units', e.target.value)} /></Field></div>}
            <Field label={t('loyaltyProgramThreshold')}><Input inputMode="numeric" value={draft.threshold} onChange={e => patch('threshold', e.target.value)} /></Field>
            <Field label={`${t('loyaltyProgramMinimum')} (${code})`} hint={<span id="loyalty-minimum-hint">{t('loyaltyProgramMinimumHint')}</span>}><Input inputMode="decimal" aria-label={`${t('loyaltyProgramMinimum')} (${code})`} aria-describedby="loyalty-minimum-hint" value={draft.minimum} onChange={e => patch('minimum', e.target.value)} /></Field>
          </CardBody></Card>
          <Card><CardHeader><CardTitle>{t('loyaltyProgramReward')}</CardTitle></CardHeader><CardBody className="space-y-4">
            <Field label={t('loyaltyProgramRewardType')}><Select aria-label={t('loyaltyProgramRewardType')} value={draft.reward} onChange={e => patch('reward', e.target.value)}><option value="fixed">{t('loyaltyProgramFixed')}</option><option value="item">{t('loyaltyProgramItem')}</option></Select></Field>
            {draft.reward === 'fixed' ? <Field label={`${t('loyaltyProgramAmount')} (${code})`}><Input inputMode="decimal" value={draft.amount} onChange={e => patch('amount', e.target.value)} /></Field> : <>
              {catalogError && <div role="alert" className="space-y-2 text-sm"><p>{t('loyaltyProgramCatalogError')}</p><Button variant="secondary" size="sm" onClick={() => setCatalogRevision(value => value + 1)}>{t('loyaltyCheckoutRefresh')}</Button></div>}
              <Field label={t('loyaltyProgramProduct')}><Select aria-label={t('loyaltyProgramProduct')} value={draft.item} onChange={e => setDraft(old => old ? { ...old, item: e.target.value, variant: '' } : old)}><option value="">{t('loyaltyProgramChoose')}</option>{draft.item && !selected && <option value={draft.item}>{t('loyaltyProgramUnavailableItem')}</option>}{items?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
              {(!!options.length || !!draft.variant) && <Field label={t('loyaltyProgramVariant')}><Select aria-label={t('loyaltyProgramVariant')} value={draft.variant} onChange={e => patch('variant', e.target.value)}><option value="">{t('loyaltyProgramChoose')}</option>{draft.variant && !options.some(o => String(o.id) === draft.variant) && <option value={draft.variant}>{t('loyaltyProgramUnavailableItem')}</option>}{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
              <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramExtras')}</p>
            </>}
            <Field label={t('loyaltyProgramValidity')} hint={<span id="loyalty-validity-hint">{t('loyaltyProgramValidityHint')}</span>}><Input inputMode="numeric" aria-label={t('loyaltyProgramValidity')} aria-describedby="loyalty-validity-hint" value={draft.validity} onChange={e => patch('validity', e.target.value)} /></Field>
          </CardBody></Card>
        </div>
        <Card><CardHeader><CardTitle>{t('loyaltyProgramContent')}</CardTitle></CardHeader><CardBody className="space-y-5">
          <Field label={t('loyaltyProgramTermsVersion')} hint={<span id="loyalty-terms-hint">{t('loyaltyProgramTermsHint')}</span>}><Input aria-label={t('loyaltyProgramTermsVersion')} aria-describedby="loyalty-terms-hint" value={draft.termsVersion} disabled={state.identity_locked} onChange={e => patch('termsVersion', e.target.value)} /></Field>
          <div className="grid min-w-0 gap-5 xl:grid-cols-3">{loyaltyLanguages.map(lang => <div key={lang} lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} className="min-w-0 space-y-4">
            <h3 className="text-sm font-semibold">{languageName[lang]}</h3>
            <Field label={`${t('loyaltyProgramName')} — ${languageName[lang]}`}><Input aria-label={`${t('loyaltyProgramName')} — ${languageName[lang]}`} value={draft.content[lang].name} onChange={e => setDraft(old => old ? { ...old, content: { ...old.content, [lang]: { ...old.content[lang], name: e.target.value } } } : old)} /></Field>
            <Field label={`${t('loyaltyProgramTerms')} — ${languageName[lang]}`}><Textarea aria-label={`${t('loyaltyProgramTerms')} — ${languageName[lang]}`} rows={5} value={draft.content[lang].terms} disabled={state.identity_locked} onChange={e => setDraft(old => old ? { ...old, content: { ...old.content, [lang]: { ...old.content[lang], terms: e.target.value } } } : old)} /></Field>
          </div>)}</div>
        </CardBody></Card>
        <Card><CardBody className="flex items-center justify-between gap-6"><div className="space-y-1"><label htmlFor="loyalty-program-enabled" className="font-medium">{t('loyaltyProgramEnabled')}</label><p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramEnabledHint')}</p></div><BooleanInput id="loyalty-program-enabled" aria-label={t('loyaltyProgramEnabled')} checked={draft.enabled} onChange={e => patch('enabled', e.target.checked)} /></CardBody></Card>
      </fieldset>
      {dirty && !valid && !pending && <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramIncomplete')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-5"><Badge tone={state.program?.enabled ? 'success' : 'neutral'}>{t(state.program?.enabled ? 'loyaltyProgramActive' : 'loyaltyProgramPaused')}</Badge>{state.can_manage_program && <Button disabled={busy || loading || blocked || rejected || (!pending && (!valid || !dirty))} onClick={() => setConfirm('save')}>{t(busy ? 'loyaltyProgramSaving' : pending ? 'loyaltyProgramResume' : 'loyaltyProgramSave')}</Button>}</div>
    </>}
    <ConfirmDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }} title={t(confirm === 'refresh' ? 'loyaltyProgramReloadTitle' : 'loyaltyProgramConfirmTitle')} description={t(confirm === 'refresh' ? 'loyaltyProgramReloadBody' : pending ? 'loyaltyProgramResumeBody' : draft?.enabled ? 'loyaltyProgramEnableBody' : 'loyaltyProgramPauseBody')} confirmLabel={t(confirm === 'refresh' ? 'loyaltyProgramReview' : pending ? 'loyaltyProgramResume' : 'loyaltyProgramConfirm')} cancelLabel={t('cancel')} onConfirm={() => { if (confirm === 'refresh') { setConfirm(null); void load(rejected); } else void submit(); }} />
  </div>;
}
