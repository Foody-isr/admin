'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { DetailSkeleton } from './primitives/DetailSkeleton';
import {
  DETAIL_BODY_GRID,
  DETAIL_MAIN_TRACK,
  DETAIL_CONTEXT_TRACK,
  DETAIL_RIBBON_BAND,
} from './primitives/layout';

/**
 * The order detail's full-screen takeover: head, progression ribbon, a
 * two-column body, command bar.
 *
 * ONE scroll region. It started as three columns that each scrolled on their
 * own, which meant reading a single order took a scroll on the left AND a
 * scroll on the right, with nothing to say content was hidden in a column you
 * were not touching. Independent scrollports belong to independent workspaces —
 * mail folders / list / message, files / editor / outline. Three facets of one
 * record get one scroll, which is what Shopify, Stripe and Linear all do on a
 * record detail. The geometry lives in primitives/layout.ts.
 *
 * Why a new component rather than a wider ds/FullScreenEditor: that primitive
 * has nine callers and a fixed shape — centred title, one 280px start rail, a
 * Save button. This surface needs a start-anchored order number, no Save and a
 * three-cluster command bar. Widening it under nine callers would be changing a
 * shared primitive to serve one screen. (FullScreenEditor has this same
 * two-scroller problem; fixing it there is its own piece of work.)
 *
 * The inset geometry below is copied from FullScreenEditor verbatim, comment
 * included, because it is already proven correct in both directions.
 */
export interface OrderDetailShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Head content: order number, status, elapsed, type. */
  head: React.ReactNode;
  /** Accessible title for the dialog. Visually the head renders its own. */
  title: string;
  /** Progression, as permanent chrome under the head at every width. */
  ribbon?: React.ReactNode;
  /** Main column: what was ordered. */
  center: React.ReactNode;
  /** End column: money, customer, delivery — what stays legible beside the
   *  ticket. */
  context: React.ReactNode;
  /** Swap the three zones for a skeleton while the order loads. */
  loading?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

export function OrderDetailShell({
  open,
  onOpenChange,
  head,
  title,
  ribbon,
  center,
  context,
  loading,
  footer,
  className,
}: OrderDetailShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            // Edge-to-edge fullscreen on mobile, inset modal at md+ via
            // symmetric left/right insets so centering is direction-agnostic.
            // (left:50% + width:calc inverts in RTL — over-constrained CSS
            // makes right: win, and translateX(-50%) shifts off-screen.)
            'fixed z-50 inset-0',
            'md:top-[24px] md:bottom-[24px]',
            'md:left-[24px] md:right-[24px]',
            // Cap the takeover on very wide screens. Still symmetric, so still
            // correct in RTL.
            '2xl:left-[max(24px,calc((100vw-1680px)/2))]',
            '2xl:right-[max(24px,calc((100vw-1680px)/2))]',
            'flex flex-col overflow-hidden min-h-0',
            'order-detail-surface',
            'bg-[var(--bg)] text-[var(--fg)]',
            'md:border md:border-[var(--line)] md:rounded-r-xl md:shadow-3',
            'focus:outline-none',
            // The fade stays under reduced motion — it is not movement. The
            // zoom does not: scaling a full-screen surface is exactly the
            // motion vestibular sensitivity reacts to.
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'motion-safe:data-[state=open]:zoom-in-[0.98]',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            className,
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Radix needs a title for the dialog's accessible name; the visible
              head composes its own richer version. */}
          <Dialog.Title className="sr-only">{title}</Dialog.Title>

          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">{head}</div>

          {loading ? (
            <DetailSkeleton />
          ) : (
          <>
          {ribbon && (
            <div className={DETAIL_RIBBON_BAND}>
              {/* Capped: buildStepperStages returns as few as two stages on an
                  order cancelled early, and two nodes 800px apart joined by a
                  hairline read as a loading bar, not a progression. */}
              <div className="mx-auto w-full max-w-[960px]">{ribbon}</div>
            </div>
          )}

          {/*
            Two columns, one scroll. CSS Grid lays its tracks start→end, so in
            Hebrew the context column moves to the left with no extra code —
            the mirror is free. See primitives/layout.ts for the geometry.
          */}
          <div className={DETAIL_BODY_GRID}>
            <main className={DETAIL_MAIN_TRACK}>{center}</main>

            <aside className={DETAIL_CONTEXT_TRACK}>
              <div className="md:sticky md:top-[var(--s-4)]">{context}</div>
            </aside>
          </div>
          </>
          )}

          {footer && (
            <div
              className={cn(
                'shrink-0 border-t border-[var(--line)] bg-[var(--surface)]',
                'px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-3)]',
                'pb-[max(var(--s-3),env(safe-area-inset-bottom))]',
              )}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
