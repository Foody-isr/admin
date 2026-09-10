"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export type SupplierHubTab = "needs" | "orders" | "suppliers" | "deliveries";

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
      href: `${base}/suppliers?tab=needs`,
      count: lowCount,
    },
    {
      key: "orders",
      label: t("purchaseOrders"),
      href: `${base}/suppliers?tab=orders`,
    },
    {
      key: "suppliers",
      label: t("suppliers"),
      href: `${base}/suppliers?tab=suppliers`,
    },
    { key: "deliveries", label: t("deliveries"), href: `${base}/supplies` },
  ];

  return (
    <nav
      aria-label={t("supplierHubTitle")}
      className="mb-[var(--s-6)] overflow-x-auto rounded-r-lg bg-[var(--surface-2)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-r-md px-4 text-fs-sm font-medium outline-none transition-colors focus-visible:shadow-ring ${
              active === tab.key
                ? "bg-[var(--surface)] text-[var(--fg)] shadow-1"
                : "text-[var(--fg-muted)] hover:bg-[var(--surface)]/60 hover:text-[var(--fg)]"
            }`}
          >
            {tab.label}
            {!!tab.count && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--danger-50)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--danger-500)]">
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
