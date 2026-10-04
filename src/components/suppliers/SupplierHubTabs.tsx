"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export type SupplierHubTab = "needs" | "orders" | "suppliers" | "deliveries";

/** Shared navigation for stock needs, orders, suppliers and received deliveries. */
export default function SupplierHubTabs({
  restaurantId,
  active,
  lowCount = 0,
}: {
  restaurantId: number;
  active: SupplierHubTab;
  lowCount?: number;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const supplierHref = (tab: SupplierHubTab) => {
    const query = new URLSearchParams(active === "deliveries" ? "" : searchParams.toString());
    query.set("tab", tab);
    return `/${restaurantId}/kitchen/suppliers?${query}`;
  };
  const base = `/${restaurantId}/kitchen`;
  const tabs: {
    key: SupplierHubTab;
    label: string;
    href: string;
    count?: number;
  }[] = [
    {
      key: "needs",
      label: t("supplierNeeds"),
      href: supplierHref("needs"),
      count: lowCount,
    },
    {
      key: "orders",
      label: t("purchaseOrders"),
      href: supplierHref("orders"),
    },
    {
      key: "suppliers",
      label: t("suppliers"),
      href: supplierHref("suppliers"),
    },
    {
      key: "deliveries",
      label: t("deliveries"),
      href: `${base}/supplies`,
    },
  ];

  return (
    <nav
      aria-label={t("supplierHubTitle")}
      className="mb-[var(--s-6)] border-b border-[var(--line)]"
    >
      <div className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-3 py-3 text-fs-xs font-medium leading-tight outline-none transition-colors focus-visible:shadow-ring sm:min-h-11 sm:px-2 sm:text-fs-sm lg:px-4 ${
              active === tab.key
                ? "border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]"
                : "border-transparent text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            }`}
          >
            <span className="min-w-0 break-words text-center [text-wrap:balance]">
              {tab.label}
            </span>
            {!!tab.count && (
              <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--danger-50)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--danger-500)]">
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
