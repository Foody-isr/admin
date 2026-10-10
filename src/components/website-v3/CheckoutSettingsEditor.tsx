"use client";

import { useState } from "react";
import CheckoutEditor, {
  type CheckoutSubTab,
} from "@/components/website/CheckoutEditor";
import type { CheckoutConfig } from "@/lib/api";

/** The checkout form, shown on the checkout surface of an order page.
 *
 *  Wraps the existing CheckoutEditor and keeps its delivery/pickup/confirmation
 *  selection in local state without adding navigation state to the draft.
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
