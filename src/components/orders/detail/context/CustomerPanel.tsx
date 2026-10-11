'use client';

import type { Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { localizeOrderType, localizeSource } from '@/lib/orders/status-presentation';
import type { CustomFieldAnswer } from '@/lib/orders/checkout-fields';
import { ContextRow } from '../primitives/ContextBlock';
import { CustomerHistoryStrip } from './CustomerHistoryStrip';
import styles from '../order-detail.module.css';

/** Customer and order facts in the drawer's label/value table. */
export function CustomerPanel({ order, canManage, onEditCustomer, customFields, t }: {
  order: Order;
  canManage: boolean;
  onEditCustomer?: () => void;
  customFields: CustomFieldAnswer[];
  t: (k: string) => string;
}) {
  const { locale } = useI18n();
  const dialable = (order.customer_phone || '').replace(/[^\d+]/g, '');
  const created = new Date(order.created_at);
  return (
    <section className={styles.customerDetails}>
      <h3>{t('details')} ({localizeOrderType(order.order_type, t)})</h3>
      <div className={styles.facts}>
        <ContextRow label={t('customer')}>
          {canManage && onEditCustomer ? (
            <button type="button" onClick={onEditCustomer} aria-label={t('editCustomer')} className={styles.factLink}>
              {order.customer_name || t('guestCustomer')}
            </button>
          ) : order.customer_name || t('guestCustomer')}
        </ContextRow>
        {order.customer_phone && <ContextRow label={t('phone')}><a className={styles.factLink} href={`tel:${dialable}`} dir="ltr">{order.customer_phone}</a></ContextRow>}
        {order.customer_email && <ContextRow label={t('email')}><a className={styles.factLink} href={`mailto:${order.customer_email}`}>{order.customer_email}</a></ContextRow>}
        <ContextRow label={t('orderDate')}><span dir="auto">{Number.isNaN(created.getTime()) ? '—' : created.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></ContextRow>
        <ContextRow label={t('source')}>{localizeSource(order.order_source, t)}</ContextRow>
        {order.table_number && <ContextRow label="Table">{order.table_number}</ContextRow>}
        {customFields.map(f => <ContextRow key={f.id} label={f.label}>{f.value}</ContextRow>)}
      </div>
      <CustomerHistoryStrip restaurantId={order.restaurant_id} phone={order.customer_phone} t={t} />
    </section>
  );
}
