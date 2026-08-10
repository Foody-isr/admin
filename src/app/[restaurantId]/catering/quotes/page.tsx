'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Badge } from '@/components/ds';
import type { BadgeProps } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  listCateringQuotes, approveCateringQuote, rejectCateringQuote, refundCateringDeposit,
  type CateringQuote, type CateringQuoteStatus, type CateringDepositStatus, type CateringRefundTarget,
} from '@/lib/api';

const STATUS_KEYS: Record<CateringQuoteStatus, string> = {
  pending_human_review: 'catering_quote_status_pending',
  approved: 'catering_quote_status_approved',
  rejected: 'catering_quote_status_rejected',
  auto_approved: 'catering_quote_status_auto',
};

const STATUS_TONE: Record<CateringQuoteStatus, BadgeProps['tone']> = {
  pending_human_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  auto_approved: 'neutral',
};

const DEPOSIT_KEYS: Record<CateringDepositStatus, string> = {
  none: 'catering_deposit_none',
  pending: 'catering_deposit_pending',
  paid: 'catering_deposit_paid',
  refunding: 'catering_deposit_refunding',
  refunded: 'catering_deposit_refunded',
};

const DEPOSIT_TONE: Record<CateringDepositStatus, BadgeProps['tone']> = {
  none: 'neutral',
  pending: 'warning',
  paid: 'success',
  refunding: 'warning',
  refunded: 'neutral',
};

interface QuoteConfigLine {
  name?: string;
  quantity?: number;
  unit_price?: number;
  basis?: string;
  line_total?: number;
}

interface QuoteConfigOption {
  name?: string;
  price?: number;
  price_mode?: string;
  line_total?: number;
}

interface QuoteConfig {
  guests?: number;
  event_date?: string;
  items?: QuoteConfigLine[];
  options?: QuoteConfigOption[];
}

function formatEventDate(eventDate: string | undefined | null): string {
  if (!eventDate) return '-';
  const d = new Date(eventDate);
  return isNaN(d.getTime()) ? eventDate : d.toLocaleDateString();
}

function parseConfig(config: unknown): QuoteConfig {
  if (!config || typeof config !== 'object') return {};
  const c = config as Record<string, unknown>;
  return {
    guests: typeof c.guests === 'number' ? c.guests : undefined,
    event_date: typeof c.event_date === 'string' ? c.event_date : undefined,
    items: Array.isArray(c.items) ? (c.items as QuoteConfigLine[]) : undefined,
    options: Array.isArray(c.options) ? (c.options as QuoteConfigOption[]) : undefined,
  };
}

export default function CateringQuotesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('catering.manage');

  const [quotes, setQuotes] = useState<CateringQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<CateringQuote | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setQuotes(await listCateringQuotes(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead title={t('catering_quotes_title')} desc={t('catering_quotes_desc')} />

      {quotes.length === 0 ? (
        <p className="text-fg-secondary mt-6">{t('catering_quote_empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_quote_customer')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_quote_guests')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_quote_event_date')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_quote_event_city')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_quote_total')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_deposit')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {quotes.map((quote, index) => (
              <DataTableRow
                key={quote.id}
                index={index}
                onClick={() => setReviewing(quote)}
                className="cursor-pointer"
              >
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {quote.customer_name}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_quote_guests')}>
                  {quote.guests}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_quote_event_date')} className="text-fg-secondary">
                  {formatEventDate(quote.event_date)}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_quote_event_city')} className="text-fg-secondary">
                  {quote.event_city || '-'}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_quote_total')}>
                  {`₪${quote.total.toFixed(2)}`}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_deposit')}>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={DEPOSIT_TONE[quote.deposit_status]}>{t(DEPOSIT_KEYS[quote.deposit_status])}</Badge>
                    {quote.deposit_overcharge_txn_uid && (
                      <Badge tone="danger">{t('catering_deposit_overcharge')}</Badge>
                    )}
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <div className="flex items-center justify-end">
                    <Badge tone={STATUS_TONE[quote.status]}>{t(STATUS_KEYS[quote.status])}</Badge>
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {reviewing && (
        <QuoteReviewModal
          restaurantId={rid}
          quote={reviewing}
          canManage={canManage}
          onClose={() => setReviewing(null)}
          onReviewed={() => { setReviewing(null); reload(); }}
        />
      )}
    </div>
  );
}

function QuoteReviewModal({ restaurantId, quote, canManage, onClose, onReviewed }: {
  restaurantId: number;
  quote: CateringQuote;
  canManage: boolean;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { t } = useI18n();
  const config = parseConfig(quote.config);
  const [adjustedTotal, setAdjustedTotal] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const showActions = quote.status === 'pending_human_review' && canManage;

  // Refund is admin-discretionary. Two targets: a recorded duplicate charge
  // ("overcharge"), or the primary deposit. Both may be present; the duplicate
  // is the urgent one, so it is the default when set.
  const hasOvercharge = !!quote.deposit_overcharge_txn_uid;
  const canRefundDeposit = quote.deposit_status === 'paid';
  const showRefund = canManage && (hasOvercharge || canRefundDeposit);
  const [refundTarget, setRefundTarget] = useState<CateringRefundTarget>(hasOvercharge ? 'overcharge' : 'deposit');
  const [refundAmount, setRefundAmount] = useState(quote.deposit_amount ? quote.deposit_amount.toFixed(2) : '');
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState('');

  const handleRefund = async () => {
    const amount = Number(refundAmount);
    if (!(amount > 0)) { setRefundError(t('catering_refund_amount_invalid')); return; }
    if (!confirm(t('catering_refund_confirm'))) return;
    setRefunding(true);
    setRefundError('');
    try {
      await refundCateringDeposit(restaurantId, quote.id, { amount, target: refundTarget });
      onReviewed();
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : t('catering_refund_failed'));
    } finally {
      setRefunding(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      const total = adjustedTotal.trim() === '' ? undefined : Number(adjustedTotal);
      await approveCateringQuote(restaurantId, quote.id, { total, note: note.trim() || undefined });
      onReviewed();
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      await rejectCateringQuote(restaurantId, quote.id, { note: note.trim() || undefined });
      onReviewed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={quote.customer_name} subtitle={t(STATUS_KEYS[quote.status])} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-fg-secondary">{t('catering_quote_guests')}</div>
            <div className="text-fg-primary font-medium">{config.guests ?? quote.guests}</div>
          </div>
          <div>
            <div className="text-fg-secondary">{t('catering_quote_event_date')}</div>
            <div className="text-fg-primary font-medium">{formatEventDate(config.event_date ?? quote.event_date)}</div>
          </div>
        </div>

        {config.items && config.items.length > 0 && (
          <div className="space-y-1">
            {config.items.map((line, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-fg-primary">
                  {line.name}
                  {typeof line.quantity === 'number' && <span className="text-fg-secondary"> ×{line.quantity}</span>}
                </span>
                <span className="text-fg-secondary">
                  {typeof line.line_total === 'number' ? `₪${line.line_total.toFixed(2)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {config.options && config.options.length > 0 && (
          <div className="space-y-1">
            {config.options.map((opt, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-fg-primary">{opt.name}</span>
                <span className="text-fg-secondary">
                  {typeof opt.line_total === 'number' ? `₪${opt.line_total.toFixed(2)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-sm font-semibold border-t pt-3" style={{ borderColor: 'var(--divider)' }}>
          <span className="text-fg-primary">{t('catering_quote_total')}</span>
          <span className="text-fg-primary">{`₪${quote.total.toFixed(2)}`}</span>
        </div>

        {quote.review_note && (
          <div className="text-sm">
            <div className="text-fg-secondary">{t('catering_quote_note')}</div>
            <div className="text-fg-primary">{quote.review_note}</div>
          </div>
        )}

        {quote.deposit_refunded_amount > 0 && (
          <div className="text-sm">
            <span className="text-fg-secondary">{t('catering_refund_refunded')}: </span>
            <span className="text-fg-primary font-medium">{`₪${quote.deposit_refunded_amount.toFixed(2)}`}</span>
            {quote.deposit_refunded_at && (
              <span className="text-fg-secondary">{` · ${new Date(quote.deposit_refunded_at).toLocaleDateString()}`}</span>
            )}
          </div>
        )}

        {showRefund && (
          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--divider)' }}>
            {hasOvercharge && (
              <p className="text-sm text-red-600 dark:text-red-400">{t('catering_refund_overcharge_warning')}</p>
            )}

            {hasOvercharge && canRefundDeposit && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={refundTarget === 'overcharge' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setRefundTarget('overcharge')}
                >
                  {t('catering_refund_target_overcharge')}
                </button>
                <button
                  type="button"
                  className={refundTarget === 'deposit' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setRefundTarget('deposit')}
                >
                  {t('catering_refund_target_deposit')}
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {t('catering_refund_amount')}
              </label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={quote.deposit_amount.toFixed(2)}
              />
            </div>

            {refundError && <p className="text-sm text-red-600 dark:text-red-400">{refundError}</p>}

            <div className="flex justify-end">
              <button className="btn-secondary" onClick={handleRefund} disabled={refunding}>
                {t('catering_refund_action')}
              </button>
            </div>
          </div>
        )}

        {showActions && (
          <div className="space-y-4 border-t pt-4" style={{ borderColor: 'var(--divider)' }}>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {t('catering_quote_adjust_total')}
              </label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={adjustedTotal}
                onChange={(e) => setAdjustedTotal(e.target.value)}
                placeholder={quote.total.toFixed(2)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {t('catering_quote_note')}
              </label>
              <textarea
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={handleReject} disabled={saving}>
                {t('catering_quote_reject')}
              </button>
              <button className="btn-primary" onClick={handleApprove} disabled={saving}>
                {t('catering_quote_approve')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
