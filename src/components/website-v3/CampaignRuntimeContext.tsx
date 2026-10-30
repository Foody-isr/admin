"use client";

import { createContext, useContext } from "react";
import type { WebsiteV3RuntimeCapabilities } from "@/lib/website-v3/runtime-capabilities";

export const CampaignRuntimeContext = createContext<WebsiteV3RuntimeCapabilities | null>(null);

/** Allows new presentation controls only when the selected public renderer supports them. */
export function useCampaignCapability(feature: "campaign_hero" | "campaign_products" | "display_typography" | "campaign_layout_controls") {
  return useContext(CampaignRuntimeContext)?.[feature] === 1;
}
