'use client';

import * as React from 'react';
import { ChevronRight, Image as ImageIcon, Palette, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  POS_PALETTE,
  type PosBgType,
  type PosDisplayTile,
  type PosTileSize,
} from '@/lib/posDisplay';

/** Available "Trier par" strategies shown when no tile is selected. */
export type PosSortKey = 'menu' | 'az' | 'color' | 'type' | 'color_type';

export const POS_SORT_OPTIONS: { key: PosSortKey; label: string }[] = [
  { key: 'menu', label: 'Ordre du menu' },
  { key: 'az', label: 'A-Z' },
  { key: 'color', label: 'Couleur' },
  { key: 'type', label: 'Type' },
  { key: 'color_type', label: 'Couleur et type' },
];

const SIZE_OPTIONS: { key: PosTileSize; label: string }[] = [
  { key: 'petit', label: 'Petit' },
  { key: 'large', label: 'Large' },
  { key: 'grand', label: 'Grand' },
];

export interface PosTileInspectorProps {
  /** Selected tile, or null when nothing is selected (shows sort options). */
  tile: PosDisplayTile | null;
  // ── Sort actions (no selection) ──
  onSort: (key: PosSortKey) => void;
  // ── Tile actions (selection) ──
  onSizeChange: (size: PosTileSize) => void;
  onBgTypeChange: (bg: PosBgType) => void;
  onColorPick: (color: string) => void;
  onImageUrlChange: (url: string) => void;
  onRenameGroup: () => void;
  onDrill: () => void;
  onRemove: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-fs-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)] mb-[var(--s-2)]">
      {children}
    </h3>
  );
}

/**
 * Right-hand context panel for the POS display editor.
 *
 * - No tile selected → "Trier par" sort options.
 * - Tile selected → size (Petit/Large/Grand), background (Image ↔ Couleur),
 *   and options (rename group / drill in for group tiles, remove for all).
 */
export function PosTileInspector({
  tile,
  onSort,
  onSizeChange,
  onBgTypeChange,
  onColorPick,
  onImageUrlChange,
  onRenameGroup,
  onDrill,
  onRemove,
}: PosTileInspectorProps) {
  // ── Empty state: sort options ──
  if (!tile) {
    return (
      <div className="space-y-[var(--s-3)]">
        <SectionLabel>Trier par</SectionLabel>
        <div className="space-y-[var(--s-1)]">
          {POS_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSort(opt.key)}
              className="w-full flex items-center justify-between rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start text-fs-sm text-[var(--fg)] hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {opt.label}
              <ChevronRight className="w-4 h-4 text-[var(--fg-subtle)]" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isGroup = tile.tile_type === 'group';

  return (
    <div className="space-y-[var(--s-6)]">
      {/* ── Taille ── */}
      <section>
        <SectionLabel>Taille</SectionLabel>
        <div className="grid grid-cols-3 gap-[var(--s-1)] rounded-md bg-[var(--surface-subtle)] p-[var(--s-1)]">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSizeChange(opt.key)}
              className={cn(
                'rounded-[6px] py-[var(--s-2)] text-fs-sm font-medium transition-colors',
                tile.size === opt.key
                  ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Arrière-plan ── */}
      <section>
        <SectionLabel>Arrière-plan</SectionLabel>
        <div className="grid grid-cols-2 gap-[var(--s-1)] rounded-md bg-[var(--surface-subtle)] p-[var(--s-1)] mb-[var(--s-3)]">
          <button
            type="button"
            onClick={() => onBgTypeChange('image')}
            className={cn(
              'flex items-center justify-center gap-[var(--s-2)] rounded-[6px] py-[var(--s-2)] text-fs-sm font-medium transition-colors',
              tile.bg_type === 'image'
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
            )}
          >
            <ImageIcon className="w-4 h-4" />
            Image
          </button>
          <button
            type="button"
            onClick={() => onBgTypeChange('color')}
            className={cn(
              'flex items-center justify-center gap-[var(--s-2)] rounded-[6px] py-[var(--s-2)] text-fs-sm font-medium transition-colors',
              tile.bg_type === 'color'
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
            )}
          >
            <Palette className="w-4 h-4" />
            Couleur
          </button>
        </div>

        {tile.bg_type === 'color' ? (
          <div className="grid grid-cols-7 gap-[var(--s-2)]">
            {POS_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onColorPick(c)}
                className={cn(
                  'aspect-square rounded-full border transition',
                  tile.color === c
                    ? 'ring-2 ring-offset-2 ring-[var(--brand-500)] border-transparent'
                    : 'border-[var(--line)]',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        ) : (
          <input
            value={tile.image_url}
            onChange={(e) => onImageUrlChange(e.target.value)}
            placeholder="https://…/image.jpg"
            className="w-full h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-fs-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--line-strong)]"
          />
        )}
      </section>

      {/* ── Options ── */}
      <section>
        <SectionLabel>Options</SectionLabel>
        <div className="space-y-[var(--s-1)]">
          {isGroup && (
            <>
              <button
                type="button"
                onClick={onRenameGroup}
                className="w-full flex items-center gap-[var(--s-3)] rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start text-fs-sm text-[var(--fg)] hover:bg-[var(--surface-subtle)] transition-colors"
              >
                <Pencil className="w-4 h-4 text-[var(--fg-subtle)]" />
                Modifier le nom du groupe de menus
              </button>
              <button
                type="button"
                onClick={onDrill}
                className="w-full flex items-center justify-between rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start text-fs-sm text-[var(--fg)] hover:bg-[var(--surface-subtle)] transition-colors"
              >
                Accéder au groupe
                <ChevronRight className="w-4 h-4 text-[var(--fg-subtle)]" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="w-full flex items-center gap-[var(--s-3)] rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start text-fs-sm text-[var(--danger-500)] hover:bg-[color-mix(in_oklab,var(--danger-500)_10%,transparent)] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer du groupe de cartes
          </button>
        </div>
      </section>
    </div>
  );
}
