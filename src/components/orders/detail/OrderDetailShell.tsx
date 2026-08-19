'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { DetailSkeleton } from './primitives/DetailSkeleton';

/**
 * The order detail's full-screen takeover: head, optional ribbon, three body
 * zones, command bar.
 *
 * Why a new component rather than a wider ds/FullScreenEditor: that primitive
 * has nine callers and a fixed shape — centred title, one 280px start rail, a
 * Save button. This surface needs a start-anchored order number, no Save, a
 * three-cluster command bar and TWO rails. Widening it under nine callers would
 * be changing a shared primitive to serve one screen.
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
  /** Stepper promoted above the columns below the lg breakpoint. */
  ribbon?: React.ReactNode;
  /** Start rail: the order's life. Hidden below lg — the ribbon covers it. */
  spine?: React.ReactNode;
  /** Centre column: what was ordered. */
  center: React.ReactNode;
  /** End column: money, customer, delivery. */
  context: React.ReactNode;
  /** Rendered at the bottom of the context column below lg, where the spine is
   *  gone. Pass the activity trail here so it stays reachable on a laptop. */
  contextOverflow?: React.ReactNode;
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
  spine,
  center,
  context,
  contextOverflow,
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
            <div className="lg:hidden shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] py-[var(--s-3)]">
              {ribbon}
            </div>
          )}

          {/*
            Three zones. CSS Grid lays its tracks start→end, so in Hebrew the
            spine moves to the right and the context column to the left with no
            extra code — the mirror is free.

            Every track carries min-h-0: without it the tracks refuse to shrink
            and the whole modal scrolls instead of each column.
          */}
          <div
            className={cn(
              'flex-1 min-h-0 flex flex-col',
              'overflow-y-auto md:overflow-hidden',
              'md:grid md:[grid-template-columns:minmax(0,1fr)_320px]',
              'lg:[grid-template-columns:288px_minmax(0,1fr)_360px]',
              'xl:[grid-template-columns:300px_minmax(0,1fr)_384px]',
            )}
          >
            {spine && (
              <aside
                className={cn(
                  'hidden lg:flex lg:flex-col min-h-0 overflow-y-auto',
                  'bg-[var(--bg)] border-e border-[var(--line)]',
                  'px-[var(--s-5)] py-[var(--s-5)] gap-[var(--s-6)]',
                )}
              >
                {spine}
              </aside>
            )}

            <main
              className={cn(
                'min-w-0 md:min-h-0 md:overflow-y-auto bg-[var(--surface)]',
                'px-[var(--s-4)] md:px-[var(--s-6)] xl:px-[var(--s-8)] py-[var(--s-5)]',
              )}
            >
              {center}
            </main>

            <aside
              className={cn(
                'min-w-0 md:min-h-0 md:overflow-y-auto',
                'bg-[var(--surface)] md:border-s border-[var(--line)]',
                'px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-5)]',
              )}
            >
              {context}
              {contextOverflow && (
                <div className="lg:hidden mt-[var(--s-6)] pt-[var(--s-6)] border-t border-[var(--line)]">
                  {contextOverflow}
                </div>
              )}
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
