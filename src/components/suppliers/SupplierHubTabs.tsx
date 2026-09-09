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
      className="mb-[var(--s-5)] overflow-x-auto border-b border-[var(--line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full gap-[var(--s-5)]">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={`relative inline-flex h-11 items-center gap-2 whitespace-nowrap text-fs-sm font-medium outline-none transition-colors focus-visible:shadow-ring ${
              active === tab.key
                ? "text-[var(--fg)] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[var(--brand-500)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
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
