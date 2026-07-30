"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Send,
  Smartphone,
} from "lucide-react";
import type {
  AutosaveStatus,
} from "@/lib/website-v3/autosave";
import type { PreviewDevice } from "@/lib/website-v3/types";

export function BuilderShell({
  restaurantId,
  restaurantName,
  status,
  previewStatus,
  device,
  publicUrl,
  publishedAt,
  canPublish,
  busy,
  onDeviceChange,
  onDiscard,
  onPublish,
  rail,
  inspector,
  preview,
}: {
  restaurantId: number;
  restaurantName: string;
  status: AutosaveStatus;
  previewStatus: "syncing" | "synced" | "stale";
  device: PreviewDevice;
  publicUrl: string | null;
  publishedAt?: string | null;
  canPublish: boolean;
  busy: boolean;
  onDeviceChange: (device: PreviewDevice) => void;
  onDiscard: () => void;
  onPublish: () => void;
  rail: ReactNode;
  inspector: ReactNode;
  preview: ReactNode;
}) {
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    setRailCollapsed(
      window.localStorage.getItem("foody.website-v3.rail-collapsed") ===
        "true",
    );
  }, []);

  const toggleRail = () => {
    setRailCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(
        "foody.website-v3.rail-collapsed",
        String(next),
      );
      return next;
    });
  };

  return (
    <div className="hidden h-screen min-h-[720px] flex-col overflow-hidden bg-[#171b22] text-slate-950 lg:flex">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#11151b] px-4 text-white">
        <a
          href={`/${restaurantId}/dashboard`}
          aria-label="Retour au tableau de bord"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:border-white/25 hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </a>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{restaurantName}</h1>
            <span className="rounded-md border border-[#84a5ff]/40 bg-[#315fce]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b8caff]">
              V3 Beta
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {status === "saving"
              ? "Enregistrement…"
              : status === "error"
                ? "Échec de l’enregistrement"
                : status === "saved"
                  ? "Brouillon enregistré"
                  : "Prêt"}
            {publishedAt ? ` · publié ${formatDate(publishedAt)}` : ""}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`mr-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              previewStatus === "synced"
                ? "bg-emerald-400/10 text-emerald-300"
                : previewStatus === "stale"
                  ? "bg-amber-400/10 text-amber-200"
                  : "bg-white/5 text-slate-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                previewStatus === "synced"
                  ? "bg-emerald-300"
                  : previewStatus === "stale"
                    ? "bg-amber-300"
                    : "animate-pulse bg-slate-300"
              }`}
            />
            {previewStatus === "synced"
              ? "Aperçu à jour"
              : previewStatus === "stale"
                ? "Aperçu désynchronisé"
                : "Mise à jour…"}
          </span>

          <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
            <DeviceButton
              active={device === "desktop"}
              label="Aperçu ordinateur"
              onClick={() => onDeviceChange("desktop")}
            >
              <Monitor className="h-4 w-4" />
            </DeviceButton>
            <DeviceButton
              active={device === "mobile"}
              label="Aperçu mobile"
              onClick={() => onDeviceChange("mobile")}
            >
              <Smartphone className="h-4 w-4" />
            </DeviceButton>
          </div>
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir le site
            </a>
          ) : null}
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Annuler
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy || !canPublish}
            className="flex h-9 items-center gap-2 rounded-xl bg-[#d7ff4f] px-4 text-xs font-bold text-[#172000] shadow-[0_8px_24px_rgba(215,255,79,0.14)] transition hover:bg-[#e2ff78] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Publier
          </button>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-200"
        style={{
          gridTemplateColumns: `${
            railCollapsed ? "48px" : "240px"
          } minmax(320px,420px) minmax(640px,1fr)`,
        }}
      >
        <aside className="relative min-h-0 overflow-y-auto border-r border-slate-200 bg-[#f8fafc]">
          <button
            type="button"
            aria-label={
              railCollapsed
                ? "Ouvrir le panneau des pages"
                : "Réduire le panneau des pages"
            }
            title={
              railCollapsed
                ? "Ouvrir le panneau des pages"
                : "Réduire le panneau des pages"
            }
            onClick={toggleRail}
            className={`sticky top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900 ${
              railCollapsed ? "mx-auto" : "float-right mr-2"
            }`}
          >
            {railCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div className={railCollapsed ? "hidden" : "block"}>{rail}</div>
        </aside>
        <section className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white">
          {inspector}
        </section>
        <main className="min-h-0 min-w-0 bg-[#242a33]">{preview}</main>
      </div>
    </div>
  );
}

function DeviceButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-8 items-center justify-center rounded-lg transition ${
        active ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
