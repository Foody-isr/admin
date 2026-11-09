'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { ApiError, getStoredUser, listLoyaltyCheckouts, type LoyaltyCheckoutView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { loyaltyAmount, loyaltyLoadError, loyaltyPaymentLabel, loyaltyRewardLabel } from './display';
import { Badge, Button, EmptyState, PageHead, Table, TableShell, Tbody, Td, Th, Thead, Tr } from '@/components/ds';
import LoyaltyCheckoutDetailDrawer from './LoyaltyCheckoutDetailDrawer';

/** An operator queue scoped to both the active restaurant and signed-in actor. */
export default function LoyaltyCheckoutWorkspace() {
  const { restaurantId } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [sessionActor, setSessionActor] = useState<number | null>(null);
  useEffect(() => {
    const check = () => { try { setSessionActor(getStoredUser()?.id ?? 0); } catch { setSessionActor(0); } };
    check(); window.addEventListener('storage', check); window.addEventListener('focus', check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener('focus', check); };
  }, [user?.id]);
  if (sessionActor === null) return <p role="status">{t('loading')}</p>;
  if (!user?.id || sessionActor !== user.id) return <p role="alert">{t('loyaltyCheckoutForbidden')}</p>;
  return <Queue key={`${restaurantId}:${user?.id ?? 0}`} rid={Number(restaurantId)} actor={user?.id ?? 0} />;
}

/** Disabled rollout has an explicit local empty state and makes no loyalty request. */
export function LoyaltyCheckoutUnavailable() {
  const { t } = useI18n();
  return <EmptyState title={t('loyaltyCheckoutUnavailable')} />;
}

function Queue({ rid, actor }: { rid: number; actor: number }) {
  const { t } = useI18n();
  const [items, setItems] = useState<LoyaltyCheckoutView[]>([]);
  const [next, setNext] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (after = 0) => {
    if (!Number.isSafeInteger(rid) || rid < 1 || actor < 1) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setError('');
    try {
      const page = await listLoyaltyCheckouts(rid, after, request.signal);
      if (current()) { setItems(old => after ? [...old.filter(row => !page.items.some(nextRow => nextRow.order_id === row.order_id)), ...page.items] : page.items); setNext(page.next_after ?? 0); }
    } catch (failure) {
      if (current() && !request.signal.aborted) { setError(loyaltyLoadError(failure)); if (!after || failure instanceof ApiError && failure.status === 403) { setItems([]); setNext(0); setSelected(null); } }
    } finally { if (current()) setLoading(false); }
  }, [rid, actor]);
  useEffect(() => { const state = lifetime.current; state.generation++; void load(); return () => { state.generation++; controller.current?.abort(); }; }, [load]);
  return <div className="min-w-0 space-y-6">
    <PageHead title={t('loyaltyCheckoutTitle')} desc={t('loyaltyCheckoutIntro')} actions={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" />{t('loyaltyCheckoutRefresh')}</Button>} />
    {error && <div role="alert" className="border-s-2 border-[var(--warning-500)] ps-4 text-sm text-[var(--fg)]">{t(error)}</div>}
    {loading && !items.length ? <p role="status" className="py-12 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : !items.length && !error ? <EmptyState icon={<ClipboardCheck />} title={t('loyaltyCheckoutEmpty')} desc={t('loyaltyCheckoutEmptyBody')} /> : !!items.length && <TableShell><Table aria-label={t('loyaltyCheckoutTitle')}><Thead><Tr><Th>{t('loyaltyCheckoutOrder')}</Th><Th>{t('loyaltyCheckoutPayment')}</Th><Th className="hidden md:table-cell">{t('loyaltyCheckoutReward')}</Th><Th className="hidden sm:table-cell">{t('loyaltyCheckoutAmount')}</Th><Th><span className="sr-only">{t('loyaltyCheckoutInspect')}</span></Th></Tr></Thead><Tbody>{items.map(row => <Tr key={row.order_id}>
      <Td><span className="font-semibold tabular-nums">#{row.order_id}</span><span className="mt-1 block text-xs text-[var(--fg-muted)] sm:hidden">{loyaltyAmount(row, t('loyaltyCheckoutUnknownAmount'))}</span></Td>
      <Td><Badge tone={row.next_step === 'review' ? 'warning' : 'neutral'} className="whitespace-normal">{t(row.next_step === 'review' ? 'loyaltyCheckoutReview' : loyaltyPaymentLabel(row.payment_state))}</Badge></Td>
      <Td className="hidden md:table-cell">{t(loyaltyRewardLabel(row.reward_state))}</Td><Td className="hidden sm:table-cell"><bdi className="tabular-nums">{loyaltyAmount(row, t('loyaltyCheckoutUnknownAmount'))}</bdi></Td>
      <Td className="text-end"><Button variant="secondary" size="sm" onClick={() => setSelected(row.order_id)} aria-label={`${t('loyaltyCheckoutInspect')} #${row.order_id}`}>{t('loyaltyCheckoutInspect')}</Button></Td>
    </Tr>)}</Tbody></Table></TableShell>}
    {!!next && !error && <Button variant="secondary" disabled={loading} onClick={() => void load(next)}>{t(loading ? 'loading' : 'loyaltyCheckoutMore')}</Button>}
    {selected !== null && <LoyaltyCheckoutDetailDrawer key={`${rid}:${actor}:${selected}`} rid={rid} actor={actor} oid={selected} onClose={() => setSelected(null)} onResolved={() => void load()} />}
  </div>;
}
