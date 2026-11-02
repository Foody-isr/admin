"use client";
import type { OrderEventConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { eventOrderCopy } from "@/lib/orders/event-order-copy";

/** Edits per-order event requirements without changing the public catalogue. */
export function EventOrderFields({
  value,
  onChange,
  online,
  allowNoPayment = true,
  paymentOnly = false,
  holdEnabled = false,
}: {
  value: OrderEventConfig;
  onChange: (value: OrderEventConfig) => void;
  online: boolean;
  allowNoPayment?: boolean;
  paymentOnly?: boolean;
  holdEnabled?: boolean;
}) {
  const { locale } = useI18n();
  const c = eventOrderCopy[locale];
  const update = (patch: Partial<OrderEventConfig>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      {!paymentOnly && <>
      <p className="text-fs-xs text-[var(--fg-muted)]">{c.dueHint}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            "name",
            "guests",
            "event_date",
            "event_time",
            "venue",
            "contact",
            "notes",
          ] as const
        ).map((key) => (
          <div key={key} className="flex flex-col gap-1 text-fs-xs">
            <label className="flex flex-col gap-1">
              {c[key]}
              <input
                className="input"
                type={
                  key === "guests"
                    ? "number"
                    : key === "event_date"
                      ? "date"
                      : key === "event_time"
                        ? "time"
                        : "text"
                }
                min={key === "guests" ? 1 : undefined}
                max={key === "guests" ? 100000 : undefined}
                maxLength={key === "notes" ? 1000 : key === "venue" ? 500 : 120}
                value={value[key] || ""}
                onChange={(e) =>
                  update({
                    [key]:
                      key === "guests"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            </label>
            {(["guests", "event_date", "event_time"] as string[]).includes(
              key,
            ) && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`${c[key]} ${c.required}`}
                  checked={
                    key === "guests"
                      ? value.require_guests
                      : key === "event_date"
                        ? value.require_date
                        : value.require_time
                  }
                  onChange={(e) =>
                    update({
                      [key === "guests"
                        ? "require_guests"
                        : key === "event_date"
                          ? "require_date"
                          : "require_time"]: e.target.checked,
                    })
                  }
                />
                {c.required}
              </label>
            )}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-fs-xs">
        <input
          type="checkbox"
          checked={!!value.allow_date_change}
          onChange={(e) => update({ allow_date_change: e.target.checked })}
        />
        {c.allowDateChange}
      </label>
      </>}
      {online && (
        <>
          <label className="flex flex-col gap-1 text-fs-xs">
            {c.payment}
            <select
              className="input"
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
                  value={value.deposit_value || ""}
                  onChange={(e) =>
                    update({ deposit_value: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
          {(value.payment_mode === "hold" || value.payment_mode === "deposit_hold") && <div className="grid grid-cols-2 gap-3">
            <label className="text-fs-xs">{c.holdType}<select className="input" value={value.hold_type ?? 'percent'} onChange={e=>update({hold_type:e.target.value as 'fixed'|'percent'})}><option value="fixed">{c.fixed}</option><option value="percent">{c.percent}</option></select></label>
            <label className="text-fs-xs">{c.holdValue}<input className="input" type="number" min="0.01" step="0.01" max={value.hold_type==='percent'?100:undefined} value={value.hold_value??100} onChange={e=>update({hold_value:Number(e.target.value)})}/></label>
          </div>}
          <label className="flex flex-col gap-1 text-fs-xs">
            {c.balanceDue}
            <input
              className="input"
              type="date"
              value={value.balance_due_date}
              onChange={(e) => update({ balance_due_date: e.target.value })}
            />
          </label>
          <p className="text-fs-xs text-[var(--fg-muted)]">
            {holdEnabled ? c.holdHint : c.holdUnavailable}
          </p>
        </>
      )}
    </div>
  );
}
