'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Plus, RefreshCw } from 'lucide-react';
import LoyaltyEarningEditor from './LoyaltyEarningEditor';
import LoyaltyProgramOverview from './LoyaltyProgramOverview';
import { ApiError, getLoyaltyProgram, getStoredUser, listAllItems, saveLoyaltyProgram, type LoyaltyProgramState, type MenuItem } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n, type Locale } from '@/lib/i18n';
import { clearProgramIntent, loyaltyProgressMode, loyaltyLanguages, loyaltyProgramDraft, loyaltyProgramPayload, readProgramIntent, storeProgramIntent, type LoyaltyProgramDraft, type PendingLoyaltyProgram } from '@/lib/loyalty-program';
import { BooleanInput, Button, ChoiceRow, ConfirmDialog, Field, Input, PageHead, Select, Tab, Tabs, TabsContent, TabsList, Textarea } from '@/components/ds';

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
  const { t, locale, direction } = useI18n();
  const [view, setView] = useState<'overview' | 'rules' | 'earning' | 'terms'>('overview');
  const [chosenLanguage, setChosenLanguage] = useState<Locale | null>(null);
  const language = chosenLanguage ?? locale;
  const editing = view !== 'overview';
  const workspace = useRef<HTMLDivElement>(null);
  const previousEditing = useRef(editing);
  useEffect(() => {
    if (previousEditing.current !== editing) workspace.current?.focus();
    previousEditing.current = editing;
  }, [editing]);
  const [state, setState] = useState<LoyaltyProgramState | null>(null), [draft, setDraft] = useState<LoyaltyProgramDraft | null>(null);
  const [pending, setPending] = useState<PendingLoyaltyProgram | null>(null), [blocked, setBlocked] = useState(false), [rejected, setRejected] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'save' | 'refresh' | 'discard' | null>(null), [items, setItems] = useState<MenuItem[] | null>(null), [catalogError, setCatalogError] = useState(false), [catalogRevision, setCatalogRevision] = useState(0);
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
      if (saved) setView(current => current === 'overview' ? 'rules' : current);
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
  function changeMode(mode:'points'|'visits') {
    setDraft(old => {
      if (!old) return old;
      const bonus = old.earning?.purchase_bonus;
      return bonus ? {...old, mode, earning:{...old.earning, purchase_bonus:{units:bonus.units, spend_minor:mode==='visits'?100:0}}} : {...old, mode};
    });
  }
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
      setRejected(false); await load(); setView('overview');
    } catch (failure) {
      if (!life.current.alive) return;
      if (failure instanceof ApiError && [400, 409, 413, 415, 422].includes(failure.status)) { setRejected(true); setError('loyaltyProgramRejected'); }
      else if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setState(null); setError('loyaltyProgramForbidden'); }
      else setError('loyaltyProgramUncertain');
    } finally { if (life.current.alive) { lock.current = false; setBusy(false); } }
  };
  const openOverview = () => {
    if (!state || pending) return;
    setDraft(loyaltyProgramDraft(state.program));
    setView('overview');
    setConfirm(null);
  };
  const updateContent = (key: 'name' | 'terms', value: string) => setDraft(current => current ? {
    ...current, content: { ...current.content, [language]: { ...current.content[language], [key]: value } },
  } : current);
  const editorTitle = !state?.can_manage_program ? 'loyaltyProgramViewSettings' : state.program ? 'loyaltyProgramEdit' : 'loyaltyProgramCreate';
  const sectionTitle = 'mb-4 text-lg font-semibold tracking-tight';
  const refreshed = rejected ? 'loyaltyProgramReview' : 'loyaltyCheckoutRefresh';
  const translated = draft && loyaltyLanguages.filter(lang => draft.content[lang].name.trim() && draft.content[lang].terms.trim());
  return <div ref={workspace} tabIndex={-1} className="min-w-0 space-y-5 pb-10 outline-none">
    {editing && <button type="button" disabled={busy || !!pending} onClick={() => dirty ? setConfirm('discard') : openOverview()}
      className="inline-flex min-h-9 items-center gap-2 rounded-r-sm text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:shadow-ring disabled:opacity-50">
      <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />{t('loyaltyProgramOverview')}
    </button>}
    <PageHead title={t(editing ? editorTitle : 'loyaltyProgramTitle')} actions={<>
      <Button variant="ghost" icon={!rejected} title={t(refreshed)} aria-label={t(refreshed)} disabled={busy || loading}
        onClick={() => dirty && !pending || rejected ? setConfirm('refresh') : void load()}>
        <RefreshCw aria-hidden="true" />{rejected && t(refreshed)}
      </Button>
      {!editing && state && (state.program || state.can_manage_program) && <Button onClick={() => { setNotice(''); setView('rules'); }}>
        {state.can_manage_program && (state.program ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />)}{t(editorTitle)}
      </Button>}
    </>} />
    {error && <p role="alert" className="border-s-2 border-[var(--warning-500)] ps-4 text-sm leading-6">{t(error)}</p>}
    {notice && <p role="status" className="border-s-2 border-[var(--info-500)] ps-4 text-sm">{t(notice)}</p>}
    {blocked && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('loyaltyProgramStorage')}</p>}
    {loading && !state && <p role="status">{t('loading')}</p>}
    {state && draft && <>
      {!state.can_manage_program && <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramReadOnly')}</p>}
      {code !== state.restaurant_currency && <p role="alert" className="text-sm">{t('loyaltyProgramCurrencyChanged')}</p>}
      {view === 'overview' ? <LoyaltyProgramOverview rid={rid} program={state.program} onEarning={()=>setView('earning')} survey={state.survey}
        item={items?.find(item => item.id === state.program?.rules.reward_item_id)} onTerms={() => { setNotice(''); setView('terms'); }} /> : <>
        {pending && <p role="status" className="border-s-2 border-[var(--warning-500)] ps-4 text-sm">{t('loyaltyProgramPending')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-r-lg bg-[var(--surface-2)] px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="loyalty-program-enabled" className="font-semibold">{t('loyaltyProgramEnabled')}</label>
            <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramEnabledHint')}</p>
          </div>
          <BooleanInput id="loyalty-program-enabled" aria-label={t('loyaltyProgramEnabled')} checked={draft.enabled}
            disabled={frozen} onChange={event => patch('enabled', event.target.checked)} />
        </div>
        {state.identity_locked && <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramIdentityLocked')}</p>}
        <Tabs variant="underline" dir={direction} value={view} onValueChange={value => setView(value === 'terms' || value === 'earning' ? value : 'rules')}>
          <TabsList aria-label={t('loyaltyProgramTitle')}>
            <Tab value="rules">{t('loyaltyProgramRules')}</Tab><Tab value="earning">{t('earnActivities')}</Tab><Tab value="terms">{t('loyaltyProgramTermsTab')}</Tab>
          </TabsList>
          <TabsContent value="rules">
            <fieldset disabled={frozen} className="grid min-w-0 gap-8 pb-2 pt-3 lg:grid-cols-2 lg:gap-12">
              <section className="min-w-0 space-y-4">
                <h2 className={sectionTitle}>{t('loyaltyProgramEarn')}</h2>
                <fieldset disabled={state.identity_locked || draft.earning?.products_only} className="min-w-0 space-y-2">
                  <legend className="sr-only">{t('loyaltyProgramMode')}</legend>
                  <ChoiceRow type="radio" name="loyalty-mode" label={t('loyaltyProgramVisits')} aria-label={t('loyaltyProgramVisits')} description={t('loyaltyProgramEarnVisit')} checked={draft.mode === 'visits'} onChange={() => changeMode('visits')} />
                  <ChoiceRow type="radio" name="loyalty-mode" label={t('loyaltyProgramPoints')} aria-label={t('loyaltyProgramPoints')} description={t('loyaltyProgramPointsHint')} checked={draft.mode === 'points'} onChange={() => changeMode('points')} />
                </fieldset>
                {draft.mode === 'points' && !draft.earning?.products_only && <div className="grid grid-cols-2 gap-4">
                  <Field label={`${t('loyaltyProgramSpend')} (${code})`}><Input inputMode="decimal" value={draft.step} onChange={e => patch('step', e.target.value)} /></Field>
                  <Field label={t('loyaltyProgramUnits')}><Input inputMode="numeric" value={draft.units} onChange={e => patch('units', e.target.value)} /></Field>
                </div>}
                <Field label={`${t('loyaltyProgramMinimum')} (${code})`} hint={<span id="loyalty-minimum-hint">{t('loyaltyProgramMinimumHint')}</span>}>
                  <Input inputMode="decimal" aria-label={`${t('loyaltyProgramMinimum')} (${code})`} aria-describedby="loyalty-minimum-hint" value={draft.minimum} onChange={e => patch('minimum', e.target.value)} />
                </Field>
              </section>
              <section className="min-w-0 space-y-4">
                <h2 className={sectionTitle}>{t('loyaltyProgramReward')}</h2>
                <fieldset className="min-w-0 space-y-2">
                  <legend className="sr-only">{t('loyaltyProgramRewardType')}</legend>
                  <ChoiceRow type="radio" name="loyalty-reward" aria-label={t('loyaltyProgramFixed')} label={t('loyaltyProgramFixed')} checked={draft.reward === 'fixed'} onChange={() => patch('reward', 'fixed')} />
                  <ChoiceRow type="radio" name="loyalty-reward" aria-label={t('loyaltyProgramItem')} label={t('loyaltyProgramItem')} checked={draft.reward === 'item'} onChange={() => patch('reward', 'item')} />
                </fieldset>
                <Field label={t(loyaltyProgressMode(draft.mode, draft.earning) === 'visits' ? 'loyaltyProgramVisitsThreshold' : 'loyaltyProgramPointsThreshold')}>
                  <Input inputMode="numeric" value={draft.threshold} onChange={e => patch('threshold', e.target.value)} />
                </Field>
                {draft.reward === 'fixed' ? <Field label={`${t('loyaltyProgramAmount')} (${code})`}><Input inputMode="decimal" value={draft.amount} onChange={e => patch('amount', e.target.value)} /></Field> : <>
                  {catalogError && <div role="alert" className="space-y-2 text-sm"><p>{t('loyaltyProgramCatalogError')}</p><Button variant="secondary" size="sm" onClick={() => setCatalogRevision(value => value + 1)}>{t('loyaltyCheckoutRefresh')}</Button></div>}
                  <Field label={t('loyaltyProgramProduct')}><Select aria-label={t('loyaltyProgramProduct')} value={draft.item} onChange={e => setDraft(old => old ? { ...old, item: e.target.value, variant: '' } : old)}>
                    <option value="">{t('loyaltyProgramChoose')}</option>{draft.item && !selected && <option value={draft.item}>{t('loyaltyProgramUnavailableItem')}</option>}{items?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select></Field>
                  {(!!options.length || !!draft.variant) && <Field label={t('loyaltyProgramVariant')}><Select aria-label={t('loyaltyProgramVariant')} value={draft.variant} onChange={e => patch('variant', e.target.value)}>
                    <option value="">{t('loyaltyProgramChoose')}</option>{draft.variant && !options.some(o => String(o.id) === draft.variant) && <option value={draft.variant}>{t('loyaltyProgramUnavailableItem')}</option>}{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select></Field>}
                  <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramExtras')}</p>
                </>}
                <Field label={t('loyaltyProgramValidity')} hint={<span id="loyalty-validity-hint">{t('loyaltyProgramValidityHint')}</span>}>
                  <Input inputMode="numeric" aria-label={t('loyaltyProgramValidity')} aria-describedby="loyalty-validity-hint" value={draft.validity} onChange={e => patch('validity', e.target.value)} />
                </Field>
                <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramPromoHint')}</p>
              </section>
            </fieldset>
          </TabsContent>
          <TabsContent value="earning">
            <fieldset className="min-w-0" disabled={frozen}><legend className="sr-only">{t('earnActivities')}</legend>
              <LoyaltyEarningEditor restaurant={rid} mode={draft.mode} currency={code} value={draft.earning} onChange={earning => setDraft(old => old ? {...old, earning} : old)} />
            </fieldset>
          </TabsContent>
          <TabsContent value="terms" className="max-w-2xl space-y-5 pb-2 pt-3">
            <Field label={t('loyaltyProgramTermsVersion')} hint={<span id="loyalty-terms-hint">{t('loyaltyProgramTermsHint')}</span>}>
              <Input className="max-w-64" aria-label={t('loyaltyProgramTermsVersion')} aria-describedby="loyalty-terms-hint" value={draft.termsVersion}
                disabled={frozen || state.identity_locked} onChange={e => patch('termsVersion', e.target.value)} />
            </Field>
            <Tabs dir={direction} value={language} onValueChange={lang => setChosenLanguage(lang as Locale)}>
              <TabsList aria-label={t('loyaltyProgramContent')} className="self-start">
                {loyaltyLanguages.map(lang => <Tab key={lang} value={lang} lang={lang}>{languageName[lang]}</Tab>)}
              </TabsList>
              {loyaltyLanguages.map(lang => <TabsContent key={lang} value={lang}>
                <fieldset disabled={frozen} className="min-w-0 space-y-4">
                  <Field label={`${t('loyaltyProgramName')} — ${languageName[lang]}`}><Input aria-label={`${t('loyaltyProgramName')} — ${languageName[lang]}`} lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}
                    value={draft.content[lang].name} onChange={e => updateContent('name', e.target.value)} /></Field>
                  <Field label={`${t('loyaltyProgramTerms')} — ${languageName[lang]}`}><Textarea aria-label={`${t('loyaltyProgramTerms')} — ${languageName[lang]}`} rows={4} lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}
                    value={draft.content[lang].terms} disabled={state.identity_locked} onChange={e => updateContent('terms', e.target.value)} /></Field>
                </fieldset>
              </TabsContent>)}
            </Tabs>
            <p className="text-sm text-[var(--fg-muted)]">{t('loyaltyProgramLanguagesFilled').replace('{n}', String(translated?.length ?? 0))}</p>
          </TabsContent>
        </Tabs>
        {state.can_manage_program && <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--bg)] py-4">
          <div className="min-w-0 flex-1 text-sm text-[var(--fg-muted)]" role="status">
            {dirty && !pending && t(valid ? 'loyaltyProgramUnsaved' : 'loyaltyProgramIncomplete')}
          </div>
          {view === 'rules' && translated?.length !== loyaltyLanguages.length && <Button variant="secondary" onClick={() => {
            setChosenLanguage(loyaltyLanguages.find(lang => !translated?.includes(lang)) ?? locale); setView('terms');
          }}>{t('loyaltyProgramCompleteTexts')}</Button>}
          <Button disabled={busy || loading || blocked || rejected || (!pending && (!valid || !dirty))} onClick={() => setConfirm('save')}>
            {t(busy ? 'loyaltyProgramSaving' : pending ? 'loyaltyProgramResume' : 'loyaltyProgramSave')}
          </Button>
        </div>}
      </>}
    </>}
    <ConfirmDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}
      title={t(confirm === 'discard' ? 'loyaltyProgramDiscardTitle' : confirm === 'refresh' ? 'loyaltyProgramReloadTitle' : 'loyaltyProgramConfirmTitle')}
      description={t(confirm === 'discard' ? 'loyaltyProgramDiscardBody' : confirm === 'refresh' ? 'loyaltyProgramReloadBody' : pending ? 'loyaltyProgramResumeBody' : draft?.enabled ? 'loyaltyProgramEnableBody' : 'loyaltyProgramPauseBody')}
      confirmLabel={t(confirm === 'discard' ? 'loyaltyProgramDiscard' : confirm === 'refresh' ? 'loyaltyProgramReview' : pending ? 'loyaltyProgramResume' : 'loyaltyProgramConfirm')}
      cancelLabel={t('cancel')} onConfirm={() => {
        if (confirm === 'discard') openOverview();
        else if (confirm === 'refresh') { setConfirm(null); void load(rejected); }
        else void submit();
      }} />
  </div>;
}
