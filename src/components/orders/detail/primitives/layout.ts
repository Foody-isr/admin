// The order detail's body geometry, in one place.
//
// This module exists because DetailSkeleton duplicated the shell's grid
// template verbatim and the two drifted, so the skeleton→content swap jumped.
// The shell imports the skeleton, so the skeleton cannot import from the shell;
// a third module is the only way both can share the strings.
//
// Every export is a concatenation of COMPLETE literal class names. Tailwind's
// scanner reads whole strings out of .ts files, so this is safe — but never
// template-interpolate a breakpoint or a token into one, or the class silently
// stops being generated.

/**
 * The single scroll container, and the two-column grid inside it.
 *
 * There is exactly ONE `overflow-y-auto` in the whole takeover and it lives on
 * the element carrying this class. The screen used to have three — spine,
 * centre and context each scrolled on its own — which meant staff had to scroll
 * the left column AND the right column to read one order, with nothing to say
 * there was more below in a column they were not touching. Three independent
 * scrollports suit three independent workspaces (mail folders / list / message);
 * one record gets one scroll.
 *
 * `min-h-0` is load-bearing: it lets this flex child shrink below its content
 * height so the overflow actually engages, instead of the content pushing the
 * command bar out of the frame.
 *
 * `md:items-stretch` is the CSS default and is written out on purpose. It is
 * exactly the declaration someone will replace with `items-start` when they try
 * to make the context column sticky — and that silently truncates the column's
 * full-height divider and surface, leaving raw --bg beside a long ticket. If
 * sticky is ever genuinely needed it must be a sticky CHILD inside a stretched
 * grid item, never the grid item itself.
 */
export const DETAIL_BODY_GRID =
  'flex-1 min-h-0 overflow-y-auto overscroll-contain ' +
  'flex flex-col ' +
  'md:grid md:items-stretch ' +
  'md:[grid-template-columns:minmax(0,1fr)_320px] ' +
  'lg:[grid-template-columns:minmax(0,1fr)_360px] ' +
  'xl:[grid-template-columns:minmax(0,1fr)_384px] ' +
  '2xl:[grid-template-columns:minmax(0,1fr)_440px]';

/**
 * The ticket. `min-w-0` is the only thing stopping a long item name from
 * blowing out the `minmax(0,1fr)` track.
 */
export const DETAIL_MAIN_TRACK =
  'min-w-0 md:col-start-1 md:row-start-1 bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-6)] xl:px-[var(--s-8)] py-[var(--s-5)]';

/**
 * Customer, delivery, money — what has to stay legible next to the ticket.
 *
 * `md:row-span-2` is load-bearing. Without it, auto-placement drops the
 * reference track at row 2 / column 1, this column ends with row 1, and cell
 * (2,2) becomes an unpainted hole showing --bg through the middle of a
 * --surface panel, with the border-s divider stopping half way down.
 *
 * `border-t md:border-t-0`: on a phone the customer block otherwise runs
 * straight out of the last ticket line with nothing between them.
 */
export const DETAIL_CONTEXT_TRACK =
  'min-w-0 md:col-start-2 md:row-start-1 md:row-span-2 bg-[var(--surface)] ' +
  'border-t md:border-t-0 md:border-s border-[var(--line)] ' +
  'px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-5)]';

/**
 * The appendix: activity, invoice, notes. Consulted, not monitored, so it sits
 * at the foot of the document rather than holding permanent screen space.
 * No border here — the caller supplies a single --line-strong rule so there is
 * exactly one division at the seam, at every width.
 */
export const DETAIL_REFERENCE_TRACK =
  'min-w-0 md:col-start-1 md:row-start-2 bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-6)] xl:px-[var(--s-8)] pb-[var(--s-6)]';

/**
 * A section heading on the ticket — HairlineRule's own box.
 *
 * Shared because DetailSkeleton has to reserve exactly this row: the ticket
 * used to open with a separate eyebrow line above the first rule, and folding
 * that line's content into the rule removed ~44px. A skeleton that still
 * reserved both would put the swap back, which is the drift this module exists
 * to prevent.
 */
export const TICKET_RULE_ROW =
  'flex items-center gap-[var(--s-3)] pt-[var(--s-5)] pb-[var(--s-2)] first:pt-0';

/** Progression band under the head. Chrome: outside the scroll region. */
export const DETAIL_RIBBON_BAND =
  'shrink-0 border-b border-[var(--line)] bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-6)] py-[var(--s-3)]';
