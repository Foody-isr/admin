/** Read-only confirmed money movement, distinct from order fulfilment. */
export interface TransactionRecord {
  id: string;
  kind: 'sale' | 'refund' | 'void';
  status: string;
  method: string;
  source: string;
  payment_rail: string;
  amount_minor: number;
  currency: string;
  occurred_at: string;
  reference?: string;
  ashrait_receipt_key?: string;
  related_transaction_id?: string;
  allocation_details_unavailable?: boolean;
  allocations: Array<{ order_id?: number; check_id?: string; amount_minor?: number }>;
  items: string[];
}

/** Gross collected and locally recorded returns are separate, per currency. */
export interface TransactionHistory {
  transactions: TransactionRecord[];
  total: number;
  limit: number;
  offset: number;
  totals_by_currency: Record<string, number>;
  recorded_returns_by_currency: Record<string, number>;
}

/** Validates exact monetary values; malformed history is never a zero balance. */
export function decodeTransactionHistory(value: TransactionHistory): TransactionHistory {
  const minor = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  const currency = (s: unknown) => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
  if (!value || !Array.isArray(value.transactions) || !minor(value.total)
    || !minor(value.limit) || !minor(value.offset)
    || value.transactions.some(row => !row || typeof row.id !== 'string' || !['sale', 'refund', 'void'].includes(row.kind)
      || !minor(row.amount_minor) || !currency(row.currency) || !Number.isFinite(Date.parse(row.occurred_at))
      || typeof row.method !== 'string' || typeof row.source !== 'string' || typeof row.payment_rail !== 'string'
      || (row.ashrait_receipt_key !== undefined && (typeof row.ashrait_receipt_key !== 'string'
        || !/^(sale|refund):[0-9a-f-]{36}$/.test(row.ashrait_receipt_key) || typeof row.reference !== 'string'))
      || !Array.isArray(row.allocations) || !Array.isArray(row.items) || row.items.some(item => typeof item !== 'string'))
    || [value.totals_by_currency, value.recorded_returns_by_currency].some(totals => !totals || typeof totals !== 'object'
      || Array.isArray(totals) || Object.entries(totals).some(([code, amount]) => !currency(code) || !minor(amount)))) {
    throw new Error('transactionHistoryLoadError');
  }
  return value;
}
