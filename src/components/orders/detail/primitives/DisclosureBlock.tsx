'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CONTEXT_BLOCK_SHELL, CONTEXT_BLOCK_EYEBROW } from './ContextBlock';
import { cn } from '@/lib/utils';

/**
 * A ContextBlock whose body folds away, for the appendix at the foot of the
 * ticket.
 *
 * The point is height: activity and notes together held ~394px of a screen the
 * staff should not have to scroll, and the notes block spent 207px of that
 * saying "no notes". The point is NOT to hide things. Hiding without a signal
 * is worse than scrolling, which is why the count is not decoration here — it
 * is what makes the fold safe. A closed block always says how much is inside.
 *
 * The body genuinely UNMOUNTS when closed (Radix's Content renders nothing when
 * not present). That is deliberate: a hidden-but-mounted <textarea> is still
 * reachable by Tab and by find-in-page, which is the same failure as scrolling
 * past something. It is only safe because the data behind the count is fetched
 * ABOVE this component — see use-order-notes.ts.
 *
 * No animation. tailwind.config.ts binds accordion-down/up to
 * --radix-accordion-content-height, and Collapsible publishes
 * --radix-collapsible-content-height, so borrowing those classes would animate
 * toward an undefined variable. Instant serves the goal anyway: no delay
 * between the click and being able to read.
 *
 * The chevron needs no `rtl:` class. A down chevron rotated 180° is an up
 * chevron, and both are symmetric about the vertical axis; only its position
 * mirrors, and `ms-auto` is already logical.
 */
export function DisclosureBlock({
  label,
  count,
  mark,
  openWhen,
  children,
  className,
}: {
  label: React.ReactNode;
  /**
   * How much is inside. Pass `undefined` when the number is not KNOWN — a
   * failed fetch renders an empty list, and labelling that "0" is a confident
   * lie on a block nobody can see into.
   */
  count?: number;
  /** A glyph beside the count: "…" while loading, a warning on failure. */
  mark?: React.ReactNode;
  /**
   * Opens the block once, the first time this turns true. See the latch below.
   */
  openWhen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  // ─── The latch ─────────────────────────────────────────────────────────────
  // Both obvious wirings are bugs, so this is the piece most likely to be
  // "simplified" back into one of them:
  //
  //   * Radix's uncontrolled `defaultOpen` is read once at mount, when the
  //     notes are still [] — so a block with notes in it stays shut forever.
  //     That is precisely the fear this whole screen is answering, delivered by
  //     the obvious implementation.
  //   * Fully controlled `open={notes.length > 0}` slams the block shut the
  //     moment someone deletes the last note, mid-interaction.
  //
  // The latch: false→true opens it exactly once; after that the reader's own
  // toggles win, and nothing ever closes it from outside.
  //
  // Pair this with `key={`…-${order.id}`}` at the call site, or the latch
  // carries across orders — and key it on the ID, never the order object: the
  // board hands down a new reference on every WebSocket event, which would
  // close a block the reader had just opened.
  const [open, setOpen] = React.useState(!!openWhen);
  const autoOpened = React.useRef(!!openWhen);

  React.useEffect(() => {
    if (openWhen && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [openWhen]);

  return (
    <section className={cn(CONTEXT_BLOCK_SHELL, className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/*
          `group` sits on the trigger — the element Radix stamps with
          data-state — not on the section, or the chevron never turns.

          No aria-label: Radix already supplies aria-expanded and aria-controls,
          and the visible label PLUS the count is the accessible name we want
          ("Notes internes, 2, collapsed"). An aria-label would override it and
          swallow the count, which is the whole point.
        */}
        {/*
          The eyebrow is 15px tall, which is a fine thing to read and a poor
          thing to hit. The padding grows the target to ~31px and the matching
          negative margin gives the height straight back, so the fold costs
          nothing in layout. Written as `calc(… * -1)` rather than `-my-[…]`:
          the negative arbitrary-value prefix has silently no-opped in a
          production build before.
        */}
        <CollapsibleTrigger className="group w-full flex items-center gap-[var(--s-2)] text-start py-[var(--s-2)] my-[calc(var(--s-2)*-1)] rounded-r-sm focus-visible:outline-none focus-visible:shadow-ring">
          <span className={CONTEXT_BLOCK_EYEBROW}>{label}</span>
          {count != null && (
            <span className="num text-[10px] text-[var(--fg-subtle)]">{count}</span>
          )}
          {mark}
          <ChevronDownIcon
            aria-hidden
            className="ms-auto w-3.5 h-3.5 shrink-0 text-[var(--fg-subtle)] transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-[var(--s-3)]">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
