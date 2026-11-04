"use client";
import type { OrderEventConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { eventOrderCopy } from "@/lib/orders/event-order-copy";
import { checkoutStepCopy } from "@/lib/orders/checkout-step-copy";
import { checkoutFieldProps, type CheckoutErrors } from "@/lib/orders/checkout-validation";

/** Edits per-order event requirements without changing the public catalogue. */
export function EventOrderFields({
  value,
  onChange,
  online,
  allowNoPayment = true,
  paymentOnly = false,
  holdEnabled = false,
  errors = {},
  progressive = false,
  clientRequirements = false,
}: {
  value: OrderEventConfig;
  onChange: (value: OrderEventConfig) => void;
  online: boolean;
  allowNoPayment?: boolean;
  paymentOnly?: boolean;
  holdEnabled?: boolean;
  errors?: CheckoutErrors;
  progressive?: boolean;
  clientRequirements?: boolean;
}) {
  const { locale } = useI18n();
  const c = eventOrderCopy[locale];
  const update = (patch: Partial<OrderEventConfig>) =>
    onChange({ ...value, ...patch });
  const stepCopy = checkoutStepCopy[locale];
  const errorFor = (key: keyof OrderEventConfig) => errors[`event.${key}`] && <span id={`checkout-event.${key}-error`} className="text-fs-xs text-[var(--danger-500)]">{errors[`event.${key}`]}</span>;
  const requirement = (key: 'guests' | 'event_date' | 'event_time') => {
    const flag = key === 'guests' ? 'require_guests' : key === 'event_date' ? 'require_date' : 'require_time';
    return <label key={key} className="flex items-center gap-2 text-fs-xs"><input type="checkbox" aria-label={`${c[key]} ${c.required}`} checked={value[flag]} onChange={e => update({ [flag]: e.target.checked })}/>{progressive ? c[key] : c.required}</label>;
  };
  const fields = (keys: ('name' | 'guests' | 'event_date' | 'event_time' | 'venue' | 'contact' | 'notes')[]) => keys.map(key => <div key={key} className="flex flex-col gap-1 text-fs-xs">
    <label className="flex flex-col gap-1">{c[key]}
      <input {...checkoutFieldProps(`event.${key}`, errors)} className="input" aria-label={c[key]} type={key === 'guests' ? 'number' : key === 'event_date' ? 'date' : key === 'event_time' ? 'time' : 'text'}
        min={key === 'guests' ? 0 : undefined} max={key === 'guests' ? 100000 : undefined}
        maxLength={key === 'notes' ? 1000 : key === 'venue' ? 500 : key === 'contact' ? 200 : 120}
        value={value[key] || ''} onChange={e => update({ [key]: key === 'guests' ? Number(e.target.value) : e.target.value })}/>
      {errorFor(key)}
    </label>
    {!progressive && (key === 'guests' || key === 'event_date' || key === 'event_time') && requirement(key)}
  </div>);
  return (
    <div className="space-y-4">
      {!paymentOnly && <>
        <p className="text-fs-xs text-[var(--fg-muted)]">{c.dueHint}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields(progressive ? ['guests', 'event_date', 'event_time'] : ['name', 'guests', 'event_date', 'event_time', 'venue', 'contact', 'notes'])}</div>
        {progressive && <details><summary className="cursor-pointer py-2 text-fs-sm font-medium">{stepCopy.additional}</summary><div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">{fields(['name', 'venue', 'contact', 'notes'])}</div></details>}
        {progressive && clientRequirements && <details><summary className="cursor-pointer py-2 text-fs-sm font-medium">{stepCopy.requirements}</summary><div className="space-y-3 pt-3">{(['guests', 'event_date', 'event_time'] as const).map(requirement)}<label className="flex items-center gap-2 text-fs-xs"><input type="checkbox" checked={!!value.allow_date_change} onChange={e => update({ allow_date_change: e.target.checked })}/>{c.allowDateChange}</label></div></details>}
        {!progressive && <label className="flex items-center gap-2 text-fs-xs"><input type="checkbox" checked={!!value.allow_date_change} onChange={e => update({ allow_date_change: e.target.checked })}/>{c.allowDateChange}</label>}
      </>}
      {online && (
        <>
          <label className="flex flex-col gap-1 text-fs-xs">
            {c.payment}
            <select
              className="input"
              {...checkoutFieldProps("event.payment_mode", errors)}
              value={value.payment_mode}
              onChange={(e) =>
                update({
                  payment_mode: e.target
                    .value as OrderEventConfig["payment_mode"],
                  hold_type:value.hold_type??"percent",hold_value:value.hold_value??100,
                  deposit_type:value.deposit_type||"percent",deposit_value:value.deposit_value||30,
                })
              }
            >
              {(["none", "full", "deposit", "hold", "deposit_hold"] as const)
                .filter((mode) => allowNoPayment || mode !== "none")
                .map((mode) => (
                  <option key={mode} value={mode} disabled={(mode === "hold" || mode === "deposit_hold") && !holdEnabled}>
                    {c[mode]}
                  </option>
                ))}
            </select>
          </label>
          {errorFor("payment_mode")}
          {(value.payment_mode === "deposit" || value.payment_mode === "deposit_hold") && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-fs-xs">
                {c.deposit}
                <select
                  className="input"
                  value={value.deposit_type}
                  onChange={(e) =>
                    update({
                      deposit_type: e.target.value as "fixed" | "percent",
                    })
                  }
                >
                  <option value="fixed">{c.fixed}</option>
                  <option value="percent">{c.percent}</option>
                </select>
              </label>
              <label className="text-fs-xs">
                {c.depositValue}
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={value.deposit_type === "percent" ? 99.99 : undefined}
                  {...checkoutFieldProps("event.deposit_value", errors)} aria-label={c.depositValue}
                  value={value.deposit_value || ""}
                  onChange={(e) =>
                    update({ deposit_value: Number(e.target.value) })
                  }
                />
                {errorFor("deposit_value")}
              </label>
            </div>
          )}
          {(value.payment_mode === "hold" || value.payment_mode === "deposit_hold") && <div className="grid grid-cols-2 gap-3">
            <label className="text-fs-xs">{c.holdType}<select className="input" value={value.hold_type ?? 'percent'} onChange={e=>update({hold_type:e.target.value as 'fixed'|'percent'})}><option value="fixed">{c.fixed}</option><option value="percent">{c.percent}</option></select></label>
            <label className="text-fs-xs">{c.holdValue}<input className="input" type="number" min="0.01" step="0.01" max={value.hold_type==='percent'?100:undefined} {...checkoutFieldProps("event.hold_value", errors)} aria-label={c.holdValue} value={value.hold_value??100} onChange={e=>update({hold_value:Number(e.target.value)})}/></label>
          </div>}
          {errorFor("hold_value")}
          <label className="flex flex-col gap-1 text-fs-xs">
            {c.balanceDue}
            <input
              className="input"
              type="date"
              {...checkoutFieldProps("event.balance_due_date", errors)}
              value={value.balance_due_date}
              onChange={(e) => update({ balance_due_date: e.target.value })}
            />
          </label>
          {errorFor("balance_due_date")}
          <p className="text-fs-xs text-[var(--fg-muted)]">
            {holdEnabled ? c.holdHint : c.holdUnavailable}
          </p>
        </>
      )}
    </div>
  );
}
