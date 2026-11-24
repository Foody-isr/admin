"use client";

import { Check } from "lucide-react";
import { BooleanInput } from "@/components/ds";
import type { WalletStampStyle } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { walletBannerSize, type WalletPlatform } from "@/lib/wallet-banner";
import { walletStampIcons, type WalletStampIcon } from "@/lib/wallet-stamp-icons";

const stampChoices = Object.keys(walletStampIcons) as WalletStampIcon[];

/** Edits a visit card's reusable stamp design without changing the loyalty rules. */
export function WalletStampEditor({
  style,
  onChange,
  canEnable,
}: {
  style: WalletStampStyle | null;
  onChange: (next: WalletStampStyle | null) => void;
  canEnable: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-3 border-b border-[var(--line)] pb-5">
      <legend className="sr-only">{t("stampCard")}</legend>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="wallet-stamps" className="font-semibold">
          {t("stampCard")}
        </label>
        <BooleanInput
          id="wallet-stamps"
          checked={!!style}
          disabled={!canEnable && !style}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    enabled: true,
                    icon: "coffee",
                    columns: 5,
                    paper: "#FFF9ED",
                    ink: "#543725",
                  }
                : null,
            )
          }
        />
      </div>
      {style && (
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-2 text-sm">{t("stampMark")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stampChoices.map((key) => {
                const { Icon, label } = walletStampIcons[key];
                return (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={style.icon === key}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-start text-sm aria-pressed:border-[var(--fg)] aria-pressed:bg-[var(--surface-2)]"
                    onClick={() => onChange({ ...style, icon: key })}
                  >
                    <Icon size={16} className="shrink-0" aria-hidden="true" />
                    {t(label)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-5">
            <label className="grid gap-1 text-sm">
              {t("stampColumns")}
              <select
                value={style.columns}
                className="h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2"
                onChange={(e) =>
                  onChange({ ...style, columns: Number(e.target.value) })
                }
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {(["paper", "ink"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-sm">
                {t(key === "paper" ? "stampPaper" : "stampInk")}
                <input
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-md border border-[var(--line)]"
                  value={style[key]}
                  onChange={(e) =>
                    onChange({ ...style, [key]: e.target.value.toUpperCase() })
                  }
                />
              </label>
            ))}
          </div>
          {style.paper === style.ink && (
            <p role="alert" className="text-sm text-[var(--danger-500)]">
              {t("stampContrast")}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** Draws the same two-row page and glyphs that are exported to each native Wallet. */
export function WalletStampGrid({
  style,
  progress,
  threshold,
  platform,
  overPhoto,
}: {
  style: WalletStampStyle;
  progress: number;
  threshold: number;
  platform: WalletPlatform;
  overPhoto: boolean;
}) {
  const { width, height } = walletBannerSize[platform];
  const capacity = style.columns * 2;
  const start =
    Math.floor(Math.min(progress, threshold - 1) / capacity) * capacity;
  const slots = Math.min(capacity, threshold - start);
  const earned = progress - start;
  const columns = Math.min(slots, style.columns);
  const rows = Math.ceil(slots / columns);
  const cellW = (width * 0.92) / columns;
  const cellH = (height * 0.86) / rows;
  const radius = Math.floor(Math.min(cellW, cellH) * 0.39);
  const half = Math.floor(radius * 0.54);
  return (
    <svg
      aria-hidden="true"
      data-wallet-stamps={slots}
      data-stamps-earned={earned}
      viewBox={"0 0 " + width + " " + height}
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {overPhoto && (
        <rect
          width={width}
          height={height}
          fill="black"
          fillOpacity={40 / 255}
        />
      )}
      {Array.from({ length: slots }, (_, i) => {
        const x = Math.floor(width * 0.04 + ((i % columns) + 0.5) * cellW);
        const y = Math.floor(
          height * 0.07 + (Math.floor(i / columns) + 0.5) * cellH,
        );
        const Icon = i < earned ? Check : walletStampIcons[style.icon].Icon;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={radius} fill={style.paper} />
            <Icon
              x={x - half}
              y={y - half}
              width={half * 2}
              height={half * 2}
              color={style.ink}
            />
          </g>
        );
      })}
    </svg>
  );
}
