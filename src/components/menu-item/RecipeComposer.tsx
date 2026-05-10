'use client';

import * as React from 'react';
import { ChevronRight, FlaskConical, Info, Package, Search, X } from 'lucide-react';
import { Kbd } from '@/components/ds';
import type { PrepItem, StockItem } from '@/lib/api';

// Brand colors for the brut/préparation split. Per BRUT_VS_PREPARATION.md:
// brut = green (#10b981 light, #4ade80 dark); prép = purple (#7c3aed light, #a78bfa dark).
export const BRUT_COLOR = '#10b981';
export const PREP_COLOR = '#7c3aed';

type Source =
  | { kind: 'brut'; item: StockItem }
  | { kind: 'prep'; item: PrepItem };

interface Props {
  stockItems: StockItem[];
  prepItems: PrepItem[];
  onPickBrut: (item: StockItem) => void;
  onPickPrep: (item: PrepItem) => void;
  onCreateBrut: (query: string) => void;
  onCreatePrep: (query: string) => void;
  onClose: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Inline composer — the brut vs préparation fix for the recipe tab.
 * Empty state surfaces both creation paths; filled state lists matches
 * with their type badge plus a persistent "créer" escape hatch.
 */
export function RecipeComposer({
  stockItems,
  prepItems,
  onPickBrut,
  onPickPrep,
  onCreateBrut,
  onCreatePrep,
  onClose,
  disabled,
  autoFocus,
}: Props) {
  const [query, setQuery] = React.useState('');
  const [helpOpen, setHelpOpen] = React.useState(false);
  const helpRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  React.useEffect(() => {
    if (!helpOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [helpOpen]);

  const q = query.trim().toLowerCase();
  const brutMatches = q
    ? stockItems.filter((s) => s.name.toLowerCase().includes(q) && s.is_active !== false)
    : [];
  const prepMatches = q
    ? prepItems.filter((p) => p.name.toLowerCase().includes(q) && p.is_active !== false)
    : [];
  const totalMatches = brutMatches.length + prepMatches.length;
  const hasQuery = q.length > 0;
  const noMatches = hasQuery && totalMatches === 0;

  const results: Source[] = [
    ...brutMatches.map((item): Source => ({ kind: 'brut', item })),
    ...prepMatches.map((item): Source => ({ kind: 'prep', item })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else onClose();
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const first = results[0];
      if (first.kind === 'brut') onPickBrut(first.item);
      else onPickPrep(first.item);
    }
  };

  return (
    <div
      className="bg-[var(--surface)] rounded-r-lg shadow-1 overflow-visible"
      style={{
        border: '1px solid var(--brand-500)',
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--brand-500) 12%, transparent)',
      }}
    >
      {/* Header — unified background with the body so the card reads as a
          single orange-bordered element (no internal borders / tinting). */}
      <div className="flex items-center gap-[var(--s-3)] px-[var(--s-4)] pt-[var(--s-3)]">
        <span
          className="w-6 h-6 rounded-r-sm grid place-items-center text-[var(--brand-500)] shrink-0"
          style={{ background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)' }}
          aria-hidden
        >
          <span className="text-fs-sm font-semibold leading-none">+</span>
        </span>
        <div className="text-fs-sm font-semibold flex-1">Ajouter un ingrédient</div>
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="inline-flex items-center gap-[var(--s-1)] text-fs-xs text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors"
            aria-expanded={helpOpen}
          >
            <Info className="w-3 h-3" />
            Comment choisir&nbsp;?
          </button>
          {helpOpen && <HelpPopover />}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center w-7 h-7 rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors"
          aria-label="Fermer"
          title="Fermer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-[var(--s-4)] space-y-[var(--s-4)]">
        {/* Search input */}
        <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md focus-within:border-[var(--brand-500)] focus-within:shadow-ring transition-colors duration-fast">
          <Search className="w-3.5 h-3.5 shrink-0 text-[var(--fg-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Chercher un ingrédient ou une préparation…"
            className="flex-1 h-full bg-transparent border-none outline-none text-fs-sm placeholder:text-[var(--fg-subtle)] disabled:opacity-50"
          />
          {hasQuery && (
            <span className="text-fs-xs text-[var(--fg-subtle)] shrink-0">
              {totalMatches === 0
                ? '0 résultat'
                : `${totalMatches} résultat${totalMatches > 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Empty-query help */}
        {!hasQuery && (
          <p className="text-fs-xs text-[var(--fg-subtle)] italic">
            Commencez à taper pour chercher ou créer.
          </p>
        )}

        {/* Search results — existing matches */}
        {hasQuery && totalMatches > 0 && (
          <div
            className="rounded-r-md border border-[var(--line)] p-[var(--s-2)] space-y-[var(--s-1)]"
            style={{ background: 'var(--surface-2)' }}
          >
            <SectionLabel>Résultats existants</SectionLabel>
            {results.map((r, i) =>
              r.kind === 'brut' ? (
                <ResultRow
                  key={`b-${r.item.id}`}
                  kind="brut"
                  primary={i === 0}
                  name={r.item.name}
                  meta={stockMeta(r.item)}
                  onPick={() => onPickBrut(r.item)}
                />
              ) : (
                <ResultRow
                  key={`p-${r.item.id}`}
                  kind="prep"
                  primary={i === 0}
                  name={r.item.name}
                  meta={prepMeta(r.item)}
                  onPick={() => onPickPrep(r.item)}
                />
              ),
            )}
          </div>
        )}

        {/* No-match empty state — warning + create CTAs only */}
        {noMatches && (
          <div
            className="flex items-start gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm"
            style={{
              background: 'color-mix(in oklab, var(--warning-500) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--warning-500) 30%, transparent)',
            }}
          >
            <Search className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Aucun ingrédient ou préparation pour <strong>« {query} »</strong>. Créez-le
              maintenant :
            </span>
          </div>
        )}

        {/* Create cards — always visible when there's a query */}
        {hasQuery && (
          <div className="space-y-[var(--s-2)]">
            {totalMatches > 0 && <SectionLabel>Créer nouveau</SectionLabel>}
            <CreateCard
              kind="brut"
              query={query}
              compact={totalMatches > 0}
              onClick={() => onCreateBrut(query.trim())}
            />
            <CreateCard
              kind="prep"
              query={query}
              compact={totalMatches > 0}
              onClick={() => onCreatePrep(query.trim())}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper formatters ─────────────────────────────────────────

function stockMeta(s: StockItem): string {
  const price = s.cost_per_unit > 0 ? `₪${s.cost_per_unit.toFixed(2)}/${s.unit}` : null;
  const stock = s.quantity > 0 ? 'Stock OK' : 'Stock vide';
  return [price, stock].filter(Boolean).join(' · ');
}

function prepMeta(p: PrepItem): string {
  const yld = p.yield_per_batch > 0 ? `${p.yield_per_batch} ${p.unit}/lot` : p.unit;
  return `Recette · ${yld}`;
}

// ─── Inline subcomponents ──────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--fg-subtle)] px-[var(--s-2)] py-[var(--s-1)]">
      {children}
    </div>
  );
}

function ResultRow({
  kind,
  primary,
  name,
  meta,
  onPick,
}: {
  kind: 'brut' | 'prep';
  primary: boolean;
  name: string;
  meta: string;
  onPick: () => void;
}) {
  const color = kind === 'brut' ? BRUT_COLOR : PREP_COLOR;
  const Icon = kind === 'brut' ? Package : FlaskConical;
  const typeLabel = kind === 'brut' ? 'Ingrédient brut' : 'Préparation';
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-sm text-start transition-colors"
      style={{
        background: primary
          ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))'
          : 'var(--surface)',
        border: primary ? '1px solid var(--brand-500)' : '1px solid var(--line)',
      }}
    >
      <span
        className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
        style={{ background: color }}
        aria-hidden
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</div>
        <div className="text-fs-xs text-[var(--fg-muted)] truncate flex items-center gap-[var(--s-2)]">
          <TypeBadge kind={kind}>{typeLabel}</TypeBadge>
          <span className="truncate">{meta}</span>
        </div>
      </div>
      {primary && <Kbd>↵</Kbd>}
    </button>
  );
}

function CreateCard({
  kind,
  query,
  compact,
  onClick,
}: {
  kind: 'brut' | 'prep';
  query: string;
  compact: boolean;
  onClick: () => void;
}) {
  const color = kind === 'brut' ? BRUT_COLOR : PREP_COLOR;
  const Icon = kind === 'brut' ? Package : FlaskConical;
  const kindLabel = kind === 'brut' ? 'Ingrédient brut' : 'Préparation';
  const tagline =
    kind === 'brut'
      ? 'Un produit que vous achetez et utilisez tel quel.'
      : 'Une recette que vous fabriquez en cuisine.';
  const examples =
    kind === 'brut'
      ? 'Tomate, huile, sel, pain, bœuf cru…'
      : 'Sauce maison, fond, vinaigrette, pâte…';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-[var(--s-3)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] text-start transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
      style={{
        padding: compact ? 'var(--s-2) var(--s-3)' : 'var(--s-3) var(--s-4)',
      }}
    >
      <span
        className="w-8 h-8 rounded-full grid place-items-center text-white shrink-0 mt-[2px]"
        style={{ background: color }}
        aria-hidden
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-fs-sm font-semibold text-[var(--fg)] flex items-center gap-[var(--s-2)] flex-wrap">
          <span>Créer</span>
          <span style={{ color }}>{kindLabel}</span>
          <span className="font-mono font-medium text-[var(--fg-subtle)]">« {query} »</span>
        </div>
        <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">{tagline}</div>
        {!compact && (
          <div className="text-fs-xs text-[var(--fg-subtle)] italic mt-1">≫ {examples}</div>
        )}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-[var(--fg-subtle)] shrink-0 mt-[2px]" />
    </button>
  );
}

function TypeBadge({
  kind,
  children,
}: {
  kind: 'brut' | 'prep';
  children: React.ReactNode;
}) {
  const color = kind === 'brut' ? BRUT_COLOR : PREP_COLOR;
  return (
    <span
      className="inline-flex items-center h-[18px] px-1.5 rounded-r-xs text-[10px] font-medium whitespace-nowrap"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function HelpPopover() {
  return (
    <div
      role="dialog"
      aria-label="Brut ou Préparation"
      className="absolute end-0 top-[calc(100%+8px)] z-10 w-[340px] p-[var(--s-4)] rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-3 text-fs-sm leading-[1.5]"
    >
      <div className="font-semibold mb-[var(--s-3)] flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        Brut ou Préparation&nbsp;?
      </div>
      <div className="mb-[var(--s-3)]">
        <div className="flex items-center gap-1.5 font-semibold" style={{ color: BRUT_COLOR }}>
          <span
            className="w-5 h-5 rounded-full grid place-items-center text-white"
            style={{ background: BRUT_COLOR }}
          >
            <Package className="w-2.5 h-2.5" />
          </span>
          Ingrédient brut
        </div>
        <div className="text-fs-xs text-[var(--fg-muted)] mt-1 ps-[26px]">
          Vous l&apos;achetez tel quel chez votre fournisseur. Stock en kg, L ou unités.
          <br />
          <em className="text-[var(--fg-subtle)]">
            Ex: tomate, huile d&apos;olive, pain, bœuf cru…
          </em>
        </div>
      </div>
      <div className="mb-[var(--s-3)]">
        <div className="flex items-center gap-1.5 font-semibold" style={{ color: PREP_COLOR }}>
          <span
            className="w-5 h-5 rounded-full grid place-items-center text-white"
            style={{ background: PREP_COLOR }}
          >
            <FlaskConical className="w-2.5 h-2.5" />
          </span>
          Préparation
        </div>
        <div className="text-fs-xs text-[var(--fg-muted)] mt-1 ps-[26px]">
          Vous la fabriquez en cuisine à partir d&apos;autres ingrédients. Elle a sa propre
          recette et un rendement.
          <br />
          <em className="text-[var(--fg-subtle)]">
            Ex: sauce tomate maison, fond de volaille, pâte à pizza…
          </em>
        </div>
      </div>
      <div
        className="flex items-start gap-1.5 px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-xs"
        style={{
          background: 'color-mix(in oklab, var(--brand-500) 8%, transparent)',
          border: '1px solid color-mix(in oklab, var(--brand-500) 25%, transparent)',
        }}
      >
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Une préparation peut contenir d&apos;autres préparations (ex: un fond utilisé dans une
          sauce).
        </span>
      </div>
    </div>
  );
}
