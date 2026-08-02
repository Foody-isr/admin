"use client";

import { cloneElement } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  GripVertical,
  Home,
  Plus,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import type { DraftPagePayload } from "@/lib/website-v3/types";
import { pageKey } from "@/lib/website-v3/types";
import { publicAddressForPage } from "@/lib/website-v3/url-model";

export type RailSelection =
  | { kind: "site" }
  | { kind: "page"; key: string }
  | { kind: "section"; pageKey: string; sectionKey: string };

export function PageRail({
  pages,
  selection,
  onSelectSite,
  onSelectPage,
  onCreate,
  onDuplicate,
  onMove,
  onDelete,
}: {
  pages: DraftPagePayload[];
  selection: RailSelection;
  onSelectSite: () => void;
  onSelectPage: (key: string) => void;
  onCreate: () => void;
  onDuplicate: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onDelete: (key: string) => void;
}) {
  const ordered = [...pages].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onSelectSite}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
          selection.kind === "site"
            ? "bg-slate-950 text-white shadow-sm"
            : "text-slate-700 hover:bg-white"
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            selection.kind === "site"
              ? "bg-white/10 text-[#d7ff4f]"
              : "bg-[#e8efff] text-[#315fce]"
          }`}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold">Identité du site</span>
          <span
            className={`mt-0.5 block text-[11px] ${
              selection.kind === "site" ? "text-slate-400" : "text-slate-500"
            }`}
          >
            Marque, navigation, commerce
          </span>
        </span>
      </button>

      <div className="mb-2 mt-6 flex items-center justify-between px-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Pages
        </p>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {ordered.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {ordered.map((page, index) => {
          const key = pageKey(page);
          const active =
            (selection.kind === "page" && selection.key === key) ||
            (selection.kind === "section" && selection.pageKey === key);
          return (
            <div
              key={key}
              className={`group rounded-2xl border transition ${
                active
                  ? "border-[#9bb3ef] bg-white shadow-[0_8px_22px_rgba(49,95,206,0.09)]"
                  : "border-transparent hover:border-slate-200 hover:bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectPage(key)}
                className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                <PageIcon type={page.type} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {page.title || "Sans titre"}
                    </span>
                    {page.is_default ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#315fce]" title="Page principale" />
                    ) : null}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {publicAddressForPage(page)}
                  </span>
                </span>
              </button>
              {active ? (
                <div className="flex items-center justify-end gap-0.5 border-t border-slate-100 px-2 py-1.5">
                  <RailAction
                    label="Monter"
                    fieldId="page.sort_order"
                    disabled={index === 0}
                    onClick={() => onMove(key, -1)}
                  >
                    <ChevronUp />
                  </RailAction>
                  <RailAction
                    label="Descendre"
                    fieldId="page.sort_order"
                    disabled={index === ordered.length - 1}
                    onClick={() => onMove(key, 1)}
                  >
                    <ChevronDown />
                  </RailAction>
                  {page.type !== "landing" ? (
                    <>
                      <RailAction
                        label="Dupliquer"
                        fieldId="page.duplicate"
                        onClick={() => onDuplicate(key)}
                      >
                        <Copy />
                      </RailAction>
                      <RailAction
                        label="Supprimer"
                        fieldId="page.delete"
                        tone="danger"
                        onClick={() => onDelete(key)}
                      >
                        <Trash2 />
                      </RailAction>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        data-field-id="page.create"
        onClick={onCreate}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-[#7e9be5] hover:bg-[#f2f5ff] hover:text-[#315fce]"
      >
        <Plus className="h-4 w-4" />
        Ajouter une page
      </button>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex gap-2.5">
          <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-5 text-slate-500">
            Les pages commande utilisent une ou plusieurs cartes. Les pages
            traiteur utilisent les prestations actives.
          </p>
        </div>
      </div>
    </div>
  );
}

function PageIcon({ type }: { type: DraftPagePayload["type"] }) {
  const Icon =
    type === "landing"
      ? Home
      : type === "order"
        ? ShoppingBag
        : type === "catering"
          ? UtensilsCrossed
          : FileText;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function RailAction({
  label,
  fieldId,
  disabled,
  tone,
  onClick,
  children,
}: {
  label: string;
  fieldId: string;
  disabled?: boolean;
  tone?: "danger";
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-field-id={fieldId}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition disabled:opacity-25 ${
        tone === "danger"
          ? "text-slate-400 hover:bg-red-50 hover:text-red-600"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {cloneElement(children, { className: "h-3.5 w-3.5" })}
    </button>
  );
}
