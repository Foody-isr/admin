"use client";

import { useState } from "react";
import CheckoutEditor, {
  type CheckoutSubTab,
} from "@/components/website/CheckoutEditor";
import type { CheckoutConfig } from "@/lib/api";

/** The checkout form, shown on the checkout surface of an order page.
 *
 *  Wraps the existing CheckoutEditor and keeps its delivery/pickup/confirmation
 *  sub-tab in local state, the same way the v2 builder does — the sub-tab is a
 *  view concern, not draft data.
 *
 *  `value` is SITE-level (`config.checkout_config`), shared by every order page,
 *  so `onChange` must be the builder's config callback and never the page one. */
export function CheckoutSettingsEditor({
  value,
  onChange,
}: {
  value: CheckoutConfig | null;
  onChange: (next: CheckoutConfig) => void;
}) {
  const [subTab, setSubTab] = useState<CheckoutSubTab>("delivery");
  return (
    <CheckoutEditor
      value={value}
      onChange={onChange}
      placesAvailable
      subTab={subTab}
      onSubTabChange={setSubTab}
    />
  );
}
