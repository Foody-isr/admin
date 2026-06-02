'use client';
import * as React from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PosDisplayTile } from '@/lib/posDisplay';

export interface PosTileRef {
  name: string;
  price?: number;
  imageUrl?: string;
}

export interface PosTileProps extends React.HTMLAttributes<HTMLButtonElement> {
  tile: PosDisplayTile;
  refData: PosTileRef;
  selected?: boolean;
  onClick?: () => void;
  onDrill?: () => void; // group tiles only
  draggable?: boolean;
}

/**
 * Renders a single POS display tile as it appears on the POS screen.
 * Used in the admin canvas, preview (Aperçu), and the POS itself — all three
 * must match visually.
 *
 * Visual rules (Square-style):
 *  - Solid saturated background color OR image with a bottom dark gradient overlay
 *  - White bold label bottom-left
 *  - Group tiles: Layers glyph top-left + white circular ChevronRight badge top-right
 *  - Item tiles: price line below name
 *  - Selection: brand-colored ring with offset
 */
export function PosTile({
  tile,
  refData,
  selected,
  onClick,
  onDrill,
  draggable,
  className,
  ...rest
}: PosTileProps) {
  const isImage = tile.bg_type === 'image' && !!tile.image_url;

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      className={cn(
        'relative w-full h-full rounded-md overflow-hidden text-start p-2.5',
        'flex flex-col justify-between transition select-none',
        selected && 'ring-2 ring-offset-2 ring-[var(--brand-500)]',
        className,
      )}
      style={isImage ? undefined : { backgroundColor: tile.color || '#1C1C1E' }}
      {...rest}
    >
      {/* Background image + dark gradient overlay */}
      {isImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tile.image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </>
      )}

      {/* Top row: layers glyph (groups) + drill badge */}
      <div className="relative flex items-center justify-between">
        {tile.tile_type === 'group' && <Layers className="w-4 h-4 text-white" />}
        <span aria-hidden className="flex-1" />
        {tile.tile_type === 'group' && onDrill && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onDrill();
            }}
            className="grid place-items-center w-6 h-6 rounded-full bg-white text-black shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* Bottom row: name + price */}
      <div className="relative">
        <div className="font-semibold text-fs-md text-white leading-tight">
          {refData.name}
        </div>
        {tile.tile_type === 'item' && refData.price != null && (
          <div className="text-fs-sm text-white/80">
            ₪{refData.price.toFixed(2)}
          </div>
        )}
      </div>
    </button>
  );
}
