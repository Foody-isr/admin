"use client";

import CheckoutEditor from "@/components/website/CheckoutEditor";
import type { CheckoutConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ColorStylePicker } from "./ColorStylePicker";
import { normalizeOrderJourneyColors, type OrderJourneyColors, type OrderJourneyScreen } from "@/lib/website-v3/order-journey";
import { InspectorField, controlClass } from "./controls";

export type { OrderJourneyScreen } from "@/lib/website-v3/order-journey";

/** Edits the shared commerce flow while the builder owns the preview screen. */
export function OrderJourneyEditor({
  restaurantId, colorStyle, screen, onScreenChange, orderType, onOrderTypeChange,
  value, onChange, placesAvailable, onEditCartButton, colors, onColorsChange,
}: {
  restaurantId: number;
  colorStyle: string;
  colors: OrderJourneyColors | undefined;
  onColorsChange: (value: OrderJourneyColors) => void;
  screen: OrderJourneyScreen;
  onScreenChange: (screen: OrderJourneyScreen) => void;
  orderType: "delivery" | "pickup";
  onOrderTypeChange: (type: "delivery" | "pickup") => void;
  value: CheckoutConfig | null;
  onChange: (value: CheckoutConfig) => void;
  placesAvailable: boolean;
  onEditCartButton: () => void;
}) {
  const { t } = useI18n();
  return <>
    <div className="sqe-panel-body sqe-journey">
      <InspectorField label={t("editorJourneyScreen")}>
        <select className={controlClass} value={screen} onChange={event => onScreenChange(event.target.value as OrderJourneyScreen)}>
          <option value="cart">{t("editorJourneyCart")}</option>
          <option value="checkout">{t("editorJourneyCheckout")}</option>
          <option value="confirmation">{t("editorJourneyConfirmation")}</option>
        </select>
      </InspectorField>
      <p>{t("editorJourneyPreviewHint")}</p>
      <div className="sqe-journey-links">
        <ColorStylePicker value={normalizeOrderJourneyColors(colors)[screen] ?? "default"}
          defaultLabel={t("editorJourneyInheritMenu")} inheritedStyle={colorStyle}
          onChange={id => onColorsChange({ ...normalizeOrderJourneyColors(colors), [screen]: id })} />
        <p>{t("editorJourneyDesignHint")}</p>
      </div>
      <button className="sqe-text-button" onClick={onEditCartButton}>{t("editorJourneyCartButton")}</button>
      {screen === "cart" ? <div className="sqe-journey-links">
        <p>{t("editorJourneyCartHint")}</p>
      </div> : <InspectorField label={t("editorJourneyOrderType")}>
        <select className={controlClass} value={orderType} onChange={event => onOrderTypeChange(event.target.value as "delivery" | "pickup")}>
          <option value="delivery">{t("editorJourneyDelivery")}</option>
          <option value="pickup">{t("editorJourneyPickup")}</option>
        </select>
      </InspectorField>}
      <details>
        <summary className="cursor-pointer font-medium">{t("editorJourneyRules")}</summary>
        <div className="sqe-journey-links mt-4">
          <p>{t("editorJourneyRulesHint")}</p>
          <a className="sqe-text-button" href={`/${restaurantId}/settings/orders`} target="_blank" rel="noopener noreferrer">{t("editorJourneyOrderSettings")} ↗</a>
          <a className="sqe-text-button" href={`/${restaurantId}/settings/payments`} target="_blank" rel="noopener noreferrer">{t("editorJourneyPaymentSettings")} ↗</a>
        </div>
      </details>
    </div>
    {screen !== "cart" && <div className="sqe-journey-editor">
      <p className="sqe-journey-note">{t("editorJourneyContentHint")}</p>
      <CheckoutEditor key={screen + orderType} value={value} onChange={onChange} placesAvailable={placesAvailable}
        embedded subTab={screen === "confirmation" ? "confirmation" : orderType} onSubTabChange={() => {}} />
    </div>}
  </>;
}
