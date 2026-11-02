"use client";
import type { OrderEventConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { eventOrderCopy } from "@/lib/orders/event-order-copy";
/** Shared event marker for staff order and kitchen surfaces. */
export function EventOrderBadge({
  event,
  isEvent,
}: {
  event?: OrderEventConfig;
  isEvent?: boolean;
}) {
  const { locale } = useI18n();
  return event || isEvent ? (
    <span className="ms-2 inline-flex rounded border border-[var(--warning-500)] px-2 py-0.5 text-fs-micro font-medium text-[var(--fg)]">
      {eventOrderCopy[locale].badge}
    </span>
  ) : null;
}
