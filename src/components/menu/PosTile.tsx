'use client';
import * as React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PosDisplayTile } from '@/lib/posDisplay';

export interface PosTileRef {
  name: string;
  price?: number;
  imageUrl?: string;
  /** Group tiles only: number of items in the group, shown as a subtitle. */
  itemCount?: number;
}

export interface PosTileProps extends React.HTMLAttributes<HTMLButtonElement> {
  tile: PosDisplayTile;
  refData: PosTileRef;
  selected?: boolean;
  onClick?: () => void;
  draggable?: boolean;
}

/**
 * Renders a single POS display tile, Square POS-style.
 *
 * Layout depends on the tile size:
 *  - petit (151×64) and large (312×64): single inline row — icon next to name.
 *  - grand (151×138): stacked — icon top-left, name + subtitle bottom-left.
 *
 * Group tiles show a Layers glyph and (when room allows) an "N article(s)"
 * subtitle. Item tiles show the price below the name on grand size.
 * Drill-into-group is wired by the parent via `onClick` in preview mode and
 * via the inspector panel in edit mode.
 */
export function PosTile({
  tile,
  refData,
  selected,
  onClick,
  draggable,
  className,
  ...rest
}: PosTileProps) {
  const isImage = tile.bg_type === 'image' && !!tile.image_url;
  const isGroup = tile.tile_type === 'group';
  const isStacked = tile.size === 'grand';

  const subtitle = isGroup
    ? refData.itemCount != null
      ? `${refData.itemCount} article${refData.itemCount > 1 ? 's' : ''}`
      : null
    : refData.price != null
      ? `₪${refData.price.toFixed(2)}`
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      className={cn(
        'relative w-full h-full rounded-md overflow-hidden text-start p-2.5 transition select-none',
        isStacked ? 'flex flex-col justify-between' : 'flex items-center gap-2',
        selected && 'ring-2 ring-offset-2 ring-[var(--brand-500)]',
        className,
      )}
      style={isImage ? undefined : { backgroundColor: tile.color || '#1C1C1E' }}
      {...rest}
    >
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

      {isGroup && (
        <Layers className="relative w-4 h-4 text-white shrink-0" />
      )}

      <div className={cn('relative min-w-0', isStacked ? '' : 'flex-1')}>
        <div
          className={cn(
            'font-semibold text-fs-md text-white leading-tight',
            isStacked ? '' : 'truncate',
          )}
        >
          {refData.name}
        </div>
        {subtitle && isStacked && (
          <div className="text-fs-xs text-white/70 mt-0.5">{subtitle}</div>
        )}
      </div>
    </button>
  );
}
