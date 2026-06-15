'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMenu, listAllItems, createOrder,
  type Menu, type MenuItem, type PaymentStatus,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Select, Textarea } from '@/components/ds';
import {
  NewOrderItemModal, lineUnitPrice, lineTotal, type NewOrderLine,
} from '@/components/orders/NewOrderItemModal';
import {
  ArrowLeftIcon, SearchIcon, PlusIcon, MinusIcon, Trash2Icon,
  CopyIcon, CheckIcon, ShoppingBagIcon,
} from 'lucide-react';

type OrderType = 'pickup' | 'delivery';
// How payment is recorded for a manually-built order.
type PaymentChoice = 'cash_paid' | 'card_paid' | 'unpaid' | 'link';

export default function NewOrderPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const restaurantId = Number(params.restaurantId);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [itemMap, setItemMap] = useState<Map<number, MenuItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Order being built.
  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);

  // Customer + fulfilment.
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('pickup');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apt, setApt] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [payment, setPayment] = useState<PaymentChoice>('cash_paid');

  // Submission.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [menuList, items] = await Promise.all([
          getMenu(restaurantId),
          listAllItems(restaurantId),
        ]);
        if (cancelled) return;
        setMenus(menuList);
        setItemMap(new Map(items.map((it) => [it.id, it])));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Customer-facing, orderable sections: visible POS groups with active items.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { id: number; name: string; items: MenuItem[] }[] = [];
    const seenGroup = new Set<number>();
    for (const menu of menus) {
      for (const group of menu.groups ?? []) {
        if (group.is_hidden || group.pos_enabled === false) continue;
        if (seenGroup.has(group.id)) continue;
        seenGroup.add(group.id);
        const items = (group.items ?? [])
          .map((gi) => itemMap.get(gi.id) ?? gi)
          .filter((it) => it.is_active && it.item_type !== 'combo')
          .filter((it) => !q || it.name.toLowerCase().includes(q));
        if (items.length > 0) out.push({ id: group.id, name: group.name, items });
      }
    }
    return out;
  }, [menus, itemMap, search]);

  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  function openItem(it: MenuItem) {
    // Prefer the fully-detailed catalog item (carries variants + modifiers).
    setModalItem(itemMap.get(it.id) ?? it);
  }

  function addLine(line: NewOrderLine) {
    setLines((prev) => [...prev, line]);
  }

  function changeQty(uid: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.uid === uid ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  }

  const canSubmit =
    lines.length > 0 &&
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    (orderType !== 'delivery' || address.trim().length > 0) &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const paymentMethod =
        payment === 'cash_paid' ? 'cash' : payment === 'card_paid' ? 'card' : '';
      const paymentStatus: PaymentStatus | undefined =
        payment === 'cash_paid' || payment === 'card_paid' ? 'paid' : undefined;

      const res = await createOrder(restaurantId, {
        order_type: orderType,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        payment_method: paymentMethod || undefined,
        payment_status: paymentStatus,
        payment_required: payment === 'link',
        ...(orderType === 'delivery'
          ? {
              delivery_address: address.trim(),
              delivery_city: city.trim() || undefined,
              delivery_floor: floor.trim() || undefined,
              delivery_apt: apt.trim() || undefined,
              delivery_notes: deliveryNotes.trim() || undefined,
            }
          : {}),
        items: lines.map((l) => ({
          menu_item_id: l.item.id,
          quantity: l.quantity,
          selected_variant_id: l.selectedVariantId,
          notes: l.notes || undefined,
          modifiers: l.modifiers.map((m) => ({ modifier_id: m.id, applied: true })),
        })),
      });

      if (res.payment_url) {
        setPaymentUrl(res.payment_url);
      } else {
        router.push(`/${restaurantId}/orders/all`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPaymentUrl() {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays visible for manual copy */
    }
  }

  // ─── Post-create payment-link screen ───────────────────────────────────────
  if (paymentUrl) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-[var(--s-5)] py-[var(--s-10)] text-center">
        <Badge tone="success" dot>{t('orderCreated')}</Badge>
        <h1 className="text-fs-lg font-semibold">{t('paymentLinkReady')}</h1>
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('paymentLinkHint')}</p>
        <div className="flex w-full items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-3)]">
          <span className="flex-1 truncate text-start font-mono text-fs-xs">{paymentUrl}</span>
          <Button variant="secondary" size="sm" onClick={copyPaymentUrl}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t('copied') : t('copyLink')}
          </Button>
        </div>
        <Button variant="primary" size="md" onClick={() => router.push(`/${restaurantId}/orders/all`)}>
          {t('goToOrders')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <PageHead
        title={t('newOrder')}
        desc={t('newOrderDesc')}
        actions={
          <Button variant="ghost" size="md" onClick={() => router.push(`/${restaurantId}/orders/all`)}>
            <ArrowLeftIcon />
            {t('backToOrders')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-[var(--s-4)] lg:grid-cols-[1fr_380px]">
        {/* ─── Menu browser ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-[var(--s-4)]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchItems')}
              className="ps-9"
            />
          </div>

          {loading && <p className="text-fs-sm text-[var(--fg-muted)]">{t('loading')}…</p>}
          {loadError && <p className="text-fs-sm text-[var(--danger-500)]">{loadError}</p>}
          {!loading && !loadError && sections.length === 0 && (
            <p className="text-fs-sm text-[var(--fg-muted)]">{t('noItemsFound')}</p>
          )}

          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2">
              <h2 className="text-fs-sm font-semibold text-[var(--fg)]">{section.name}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {section.items.map((it) => (
                  <button
                    key={`${section.id}-${it.id}`}
                    type="button"
                    onClick={() => openItem(it)}
                    className="flex flex-col items-start gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] p-[var(--s-3)] text-start transition-colors hover:border-[var(--brand-500)] hover:shadow-1"
                  >
                    <span className="line-clamp-2 text-fs-sm font-medium">{it.name}</span>
                    <span className="font-mono tabular-nums text-fs-xs text-[var(--fg-muted)]">
                      ₪{it.price.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Cart + customer + payment ────────────────────────────────── */}
        <div className="flex flex-col gap-[var(--s-4)] lg:sticky lg:top-[var(--s-4)] lg:self-start">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
            <div className="mb-3 flex items-center gap-2">
              <ShoppingBagIcon className="size-4 text-[var(--fg-muted)]" />
              <h2 className="text-fs-sm font-semibold">
                {t('orderItems')} {itemCount > 0 && <span className="text-[var(--fg-muted)]">· {itemCount}</span>}
              </h2>
            </div>

            {lines.length === 0 ? (
              <p className="py-4 text-center text-fs-sm text-[var(--fg-subtle)]">{t('emptyCartHint')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {lines.map((l) => (
                  <li key={l.uid} className="flex flex-col gap-1 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-fs-sm font-medium">{l.item.name}</p>
                        {l.selectedVariantName && (
                          <p className="text-fs-xs text-[var(--fg-muted)]">{l.selectedVariantName}</p>
                        )}
                        {l.modifiers.length > 0 && (
                          <p className="text-fs-xs text-[var(--fg-subtle)]">
                            {l.modifiers.map((m) => m.name).join(', ')}
                          </p>
                        )}
                        {l.notes && <p className="text-fs-xs italic text-[var(--fg-subtle)]">“{l.notes}”</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums text-fs-sm">₪{lineTotal(l).toFixed(2)}</span>
                        <span className="text-fs-xs text-[var(--fg-subtle)]">
                          ₪{lineUnitPrice(l).toFixed(2)} × {l.quantity}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" icon onClick={() => changeQty(l.uid, -1)} aria-label={t('decrease')}>
                        <MinusIcon />
                      </Button>
                      <span className="w-6 text-center font-mono tabular-nums text-fs-sm">{l.quantity}</span>
                      <Button variant="ghost" size="sm" icon onClick={() => changeQty(l.uid, 1)} aria-label={t('increase')}>
                        <PlusIcon />
                      </Button>
                      <Button variant="ghost" size="sm" icon className="ms-auto text-[var(--danger-500)]" onClick={() => removeLine(l.uid)} aria-label={t('remove')}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
              <span className="text-fs-sm font-medium">{t('total')}</span>
              <span className="font-mono tabular-nums text-fs-md font-semibold">₪{subtotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-[var(--s-3)] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
            <h2 className="text-fs-sm font-semibold">{t('customerDetails')}</h2>
            <Field label={t('customerName')}>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('customerNamePlaceholder')} />
            </Field>
            <Field label={t('customerPhone')}>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="05X-XXXXXXX" inputMode="tel" />
            </Field>
            <Field label={t('orderType')}>
              <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
                <option value="pickup">{t('pickup')}</option>
                <option value="delivery">{t('delivery')}</option>
              </Select>
            </Field>

            {orderType === 'delivery' && (
              <>
                <Field label={t('deliveryAddress')}>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('city')}>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t('floor')}>
                      <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
                    </Field>
                    <Field label={t('apt')}>
                      <Input value={apt} onChange={(e) => setApt(e.target.value)} />
                    </Field>
                  </div>
                </div>
                <Field label={t('deliveryNotes')}>
                  <Textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
                </Field>
              </>
            )}

            <Field label={t('payment')}>
              <Select value={payment} onChange={(e) => setPayment(e.target.value as PaymentChoice)}>
                <option value="cash_paid">{t('payCashPaid')}</option>
                <option value="card_paid">{t('payCardPaid')}</option>
                <option value="unpaid">{t('payUnpaid')}</option>
                <option value="link">{t('paySendLink')}</option>
              </Select>
            </Field>
          </div>

          {submitError && <p className="text-fs-sm text-[var(--danger-500)]">{submitError}</p>}

          <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!canSubmit} className="w-full justify-center">
            {submitting ? `${t('creating')}…` : `${t('createOrder')} · ₪${subtotal.toFixed(2)}`}
          </Button>
        </div>
      </div>

      <NewOrderItemModal
        item={modalItem}
        open={modalItem !== null}
        onClose={() => setModalItem(null)}
        onAdd={addLine}
      />
    </div>
  );
}
