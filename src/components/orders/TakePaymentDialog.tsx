'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BanknoteIcon, CreditCardIcon, CheckCircle2Icon, XIcon,
  DeleteIcon, CheckIcon,
} from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type PaymentMethod = 'cash' | 'credit_card';

interface TakePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number;
  onConfirm: (method: PaymentMethod) => Promise<void> | void;
}

type Stage = 'method' | 'cash_input' | 'cash_change';

export function TakePaymentDialog({
  open, onOpenChange, totalAmount, onConfirm,
}: TakePaymentDialogProps) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('method');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [finalReceived, setFinalReceived] = useState(0);
  const [finalChange, setFinalChange] = useState(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStage('method');
      setInput('');
      setSubmitting(false);
      setFinalReceived(0);
      setFinalChange(0);
    }
  }, [open]);

  const received = input === '' ? 0 : Number.parseFloat(input) || 0;
  const change = Math.max(0, received - totalAmount);
  const canConfirm = received >= totalAmount && totalAmount > 0;

  const quickAmounts = useMemo(() => buildQuickAmounts(totalAmount), [totalAmount]);

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const onDigit = (d: string) => {
    setInput((prev) => {
      if (d === '.' && prev.includes('.')) return prev;
      if (prev.includes('.')) {
        const decimals = prev.split('.')[1] ?? '';
        if (decimals.length >= 2) return prev;
      }
      if (prev.replace('.', '').length >= 7) return prev;
      return prev + d;
    });
  };

  const onBackspace = () => setInput((prev) => prev.slice(0, -1));
  const onClear = () => setInput('');

  const onPickQuick = (amount: number) => {
    setInput(Number.isInteger(amount) ? String(amount) : amount.toFixed(2));
  };

  const onPickExact = () => {
    setInput(
      Number.isInteger(totalAmount) ? String(totalAmount) : totalAmount.toFixed(2),
    );
  };

  const handleSelectCash = () => {
    setStage('cash_input');
  };

  const handleSelectCard = async () => {
    setSubmitting(true);
    try {
      await onConfirm('credit_card');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCash = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm('cash');
      setFinalReceived(received);
      setFinalChange(change);
      setStage('cash_change');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(440px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {stage === 'method' && (
            <MethodStage
              total={totalAmount}
              submitting={submitting}
              onCash={handleSelectCash}
              onCard={handleSelectCard}
              onCancel={close}
            />
          )}
          {stage === 'cash_input' && (
            <CashInputStage
              total={totalAmount}
              input={input}
              received={received}
              change={change}
              canConfirm={canConfirm}
              submitting={submitting}
              quickAmounts={quickAmounts}
              onDigit={onDigit}
              onBackspace={onBackspace}
              onClear={onClear}
              onPickQuick={onPickQuick}
              onPickExact={onPickExact}
              onConfirm={handleConfirmCash}
              onCancel={close}
            />
          )}
          {stage === 'cash_change' && (
            <CashChangeStage
              total={totalAmount}
              received={finalReceived}
              change={finalChange}
              onDone={handleDone}
            />
          )}

          {/* Hidden title/description for accessibility */}
          <Dialog.Title className="sr-only">{t('takePayment')}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {t('chooseAPaymentMethod')}
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Stage 1: Method picker ────────────────────────────────────────────

function MethodStage({
  total, submitting, onCash, onCard, onCancel,
}: {
  total: number;
  submitting: boolean;
  onCash: () => void;
  onCard: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="p-[var(--s-5)]">
      <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
        <div className="flex-1 min-w-0">
          <h2 className="text-fs-lg font-semibold text-[var(--fg)]">
            {t('takePayment')}
          </h2>
          <p className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
            {t('chooseAPaymentMethod')}
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label={t('close') || 'Close'}
          className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div
        className="flex items-center justify-between rounded-r-md px-[var(--s-4)] py-[var(--s-3)] mb-[var(--s-4)]"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
        }}
      >
        <span className="text-fs-sm text-[var(--fg-muted)]">{t('total')}</span>
        <span className="font-mono tabular-nums text-fs-lg font-semibold">
          ₪{total.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-[var(--s-3)]">
        <MethodTile
          icon={<BanknoteIcon className="w-7 h-7" />}
          label={t('cash')}
          onClick={onCash}
          disabled={submitting}
          tone="success"
        />
        <MethodTile
          icon={<CreditCardIcon className="w-7 h-7" />}
          label={t('creditCard')}
          onClick={onCard}
          disabled={submitting}
          tone="brand"
        />
      </div>

      <Button
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={submitting}
        className="w-full mt-[var(--s-3)]"
      >
        {t('cashPaymentCancel')}
      </Button>
    </div>
  );
}

function MethodTile({
  icon, label, onClick, disabled, tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: 'success' | 'brand';
}) {
  const color = tone === 'success' ? 'var(--success-500)' : 'var(--brand-500)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-[var(--s-2)] py-[var(--s-5)] rounded-r-md transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
      style={{
        background: `color-mix(in oklab, ${color} 12%, var(--surface))`,
        border: `1px solid color-mix(in oklab, ${color} 35%, var(--line))`,
        color,
      }}
    >
      {icon}
      <span className="text-fs-md font-semibold">{label}</span>
    </button>
  );
}

// ─── Stage 2: Cash input (numpad) ──────────────────────────────────────

function CashInputStage({
  total, input, received, change, canConfirm, submitting,
  quickAmounts,
  onDigit, onBackspace, onClear, onPickQuick, onPickExact,
  onConfirm, onCancel,
}: {
  total: number;
  input: string;
  received: number;
  change: number;
  canConfirm: boolean;
  submitting: boolean;
  quickAmounts: number[];
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onPickQuick: (n: number) => void;
  onPickExact: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
        <div
          className="rounded-r-md grid place-items-center w-11 h-11 shrink-0"
          style={{
            background: 'color-mix(in oklab, var(--success-500) 15%, transparent)',
            color: 'var(--success-500)',
          }}
        >
          <BanknoteIcon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-fs-lg font-semibold text-[var(--fg)]">
            {t('cashPaymentTitle')}
          </h2>
          <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
            {t('cashPaymentSubtitle')}
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label={t('close') || 'Close'}
          className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Total */}
      <InfoRow
        label={t('cashPaymentTotal')}
        value={`₪${total.toFixed(2)}`}
        tone="neutral"
      />

      {/* Received */}
      <div className="h-[var(--s-3)]" />
      <InfoRow
        label={t('cashPaymentReceived')}
        value={input === '' ? '₪0' : `₪${input}`}
        tone="brand"
      />

      {/* Change */}
      <div className="h-[var(--s-3)]" />
      <InfoRow
        label={t('cashPaymentChange')}
        value={`₪${change.toFixed(2)}`}
        tone={canConfirm ? 'success' : 'neutral'}
      />

      {/* Quick amounts */}
      <div className="flex flex-wrap gap-[var(--s-2)] mt-[var(--s-4)]">
        <QuickChip label={t('cashPaymentExact')} onClick={onPickExact} special />
        {quickAmounts.map((amount) => (
          <QuickChip
            key={amount}
            label={`₪${amount}`}
            onClick={() => onPickQuick(amount)}
          />
        ))}
        {input !== '' && (
          <QuickChip label={t('clear') || 'Clear'} onClick={onClear} />
        )}
      </div>

      {/* Numpad */}
      <div className="mt-[var(--s-4)] grid grid-cols-3 gap-[6px]">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <NumKey key={d} onClick={() => onDigit(d)}>{d}</NumKey>
        ))}
        <NumKey onClick={() => onDigit('.')}>.</NumKey>
        <NumKey onClick={() => onDigit('0')}>0</NumKey>
        <NumKey onClick={onBackspace} aria-label="Backspace">
          <DeleteIcon className="w-5 h-5 mx-auto" />
        </NumKey>
      </div>

      {/* Confirm */}
      <Button
        variant="primary"
        size="lg"
        onClick={onConfirm}
        disabled={!canConfirm || submitting}
        className="w-full mt-[var(--s-4)]"
        style={{
          background: 'var(--success-500)',
          color: '#fff',
        }}
      >
        <CheckCircle2Icon className="w-5 h-5" />
        {canConfirm
          ? (received > total
              ? t('cashPaymentConfirmChange').replace('{amount}', change.toFixed(2))
              : t('cashPaymentConfirm'))
          : t('cashPaymentConfirm')}
      </Button>
      <Button
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={submitting}
        className="w-full mt-[var(--s-2)]"
      >
        {t('cashPaymentCancel')}
      </Button>
    </div>
  );
}

// ─── Stage 3: Change screen ────────────────────────────────────────────

function CashChangeStage({
  total, received, change, onDone,
}: {
  total: number;
  received: number;
  change: number;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const hasChange = change > 0.005;

  return (
    <div className="p-[var(--s-6)] flex flex-col items-center text-center">
      <div
        className="w-16 h-16 rounded-full grid place-items-center mb-[var(--s-3)]"
        style={{
          background: 'color-mix(in oklab, var(--success-500) 15%, transparent)',
          color: 'var(--success-500)',
        }}
      >
        <CheckIcon className="w-9 h-9" />
      </div>
      <h2 className="text-fs-lg font-semibold mb-[var(--s-4)]">
        {t('cashPaymentSuccess')}
      </h2>

      <div className="w-full">
        <InfoRow label={t('cashPaymentTotal')} value={`₪${total.toFixed(2)}`} tone="neutral" />
        <div className="h-[var(--s-2)]" />
        <InfoRow label={t('cashPaymentReceived')} value={`₪${received.toFixed(2)}`} tone="neutral" />
      </div>

      {hasChange ? (
        <div
          className="w-full mt-[var(--s-4)] rounded-r-md py-[var(--s-5)] px-[var(--s-4)] flex flex-col items-center"
          style={{
            background: 'color-mix(in oklab, var(--success-500) 12%, transparent)',
            border: '2px solid color-mix(in oklab, var(--success-500) 50%, var(--line))',
            animation: 'pulse 1.6s ease-in-out infinite',
          }}
        >
          <span className="text-fs-sm font-semibold" style={{ color: 'var(--success-500)' }}>
            {t('cashPaymentChange')}
          </span>
          <span
            className="font-mono tabular-nums text-[40px] font-bold leading-none mt-[var(--s-2)]"
            style={{ color: 'var(--success-500)' }}
          >
            ₪{change.toFixed(2)}
          </span>
        </div>
      ) : (
        <div
          className="w-full mt-[var(--s-4)] rounded-r-md py-[var(--s-4)] px-[var(--s-4)] text-center text-fs-md font-semibold"
          style={{
            background: 'color-mix(in oklab, var(--success-500) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--success-500) 40%, var(--line))',
            color: 'var(--success-500)',
          }}
        >
          {t('cashPaymentNoChange')}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={onDone}
        className="w-full mt-[var(--s-5)]"
        style={{ background: 'var(--success-500)', color: '#fff' }}
      >
        <CheckIcon className="w-5 h-5" />
        {t('cashPaymentDone')}
      </Button>
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────

function InfoRow({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'brand' | 'success';
}) {
  const styles = {
    neutral: {
      bg: 'var(--surface-2)',
      border: 'var(--line)',
      labelColor: 'var(--fg-muted)',
      valueColor: 'var(--fg)',
    },
    brand: {
      bg: 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))',
      border: 'color-mix(in oklab, var(--brand-500) 30%, var(--line))',
      labelColor: 'var(--brand-500)',
      valueColor: 'var(--brand-500)',
    },
    success: {
      bg: 'color-mix(in oklab, var(--success-500) 10%, var(--surface))',
      border: 'color-mix(in oklab, var(--success-500) 40%, var(--line))',
      labelColor: 'var(--success-500)',
      valueColor: 'var(--success-500)',
    },
  }[tone];
  return (
    <div
      className="flex items-center justify-between px-[var(--s-4)] py-[var(--s-3)] rounded-r-md"
      style={{ background: styles.bg, border: `1px solid ${styles.border}` }}
    >
      <span className="text-fs-sm" style={{ color: styles.labelColor }}>{label}</span>
      <span
        className="font-mono tabular-nums text-fs-lg font-bold"
        style={{ color: styles.valueColor }}
      >
        {value}
      </span>
    </div>
  );
}

function QuickChip({
  label, onClick, special,
}: {
  label: string;
  onClick: () => void;
  special?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-[var(--s-3)] py-[var(--s-2)] rounded-full text-fs-sm font-semibold transition-colors',
      )}
      style={
        special
          ? {
              background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
              color: 'var(--brand-500)',
              border: '1px solid color-mix(in oklab, var(--brand-500) 30%, var(--line))',
            }
          : {
              background: 'var(--surface-2)',
              color: 'var(--fg)',
              border: '1px solid var(--line)',
            }
      }
    >
      {label}
    </button>
  );
}

function NumKey({
  children, onClick, ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className="h-12 rounded-r-md text-fs-md font-semibold transition-colors hover:brightness-110 active:scale-[0.98]"
      style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function buildQuickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const amounts: number[] = [];
  const nearest10 = Math.ceil(total / 10) * 10;
  if (nearest10 > total) amounts.push(nearest10);
  for (const bill of [20, 50, 100, 200]) {
    if (bill >= total && !amounts.includes(bill)) amounts.push(bill);
  }
  return amounts.slice(0, 4);
}
