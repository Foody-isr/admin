// The order detail's body geometry, shared by the loaded and skeleton states.
// Keep every Tailwind class as a complete literal so the scanner can see it.

/** Mobile is one natural document scroll. From `md` upward the grid is fixed,
 * and the ticket owns the only scrollport. */
export const DETAIL_BODY_GRID =
  'flex-1 min-h-0 overflow-y-auto overscroll-contain ' +
  'flex flex-col ' +
  'md:grid md:items-stretch md:overflow-hidden md:overscroll-auto ' +
  'md:[grid-template-rows:minmax(0,1fr)] ' +
  'md:[grid-template-columns:minmax(0,1fr)_320px] ' +
  'lg:[grid-template-columns:minmax(0,1fr)_360px] ' +
  'xl:[grid-template-columns:minmax(0,1fr)_384px] ' +
  '2xl:[grid-template-columns:minmax(0,1fr)_440px]';

/** Groups the scrollable item list and its fixed notes dock. */
export const DETAIL_TICKET_COLUMN =
  'min-w-0 md:min-h-0 md:col-start-1 md:row-start-1 flex flex-col bg-[var(--surface)]';

/** The item list: the sole desktop scrollport. */
export const DETAIL_MAIN_TRACK =
  'min-w-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-5)] xl:px-[var(--s-6)] py-[var(--s-4)]';

/** Internal notes stay attached to the bottom of the ticket. */
export const DETAIL_NOTES_DOCK =
  'shrink-0 border-t border-[var(--line-strong)] bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-5)] xl:px-[var(--s-6)]';

/** Customer, delivery and money remain fully visible beside the ticket. */
export const DETAIL_CONTEXT_TRACK =
  'order-detail-context min-w-0 md:col-start-2 md:row-start-1 bg-[var(--surface-2)] ' +
  'border-t md:border-t-0 md:border-s border-[var(--line)] ' +
  'px-[var(--s-3)] md:px-[var(--s-4)] 2xl:px-[var(--s-5)] py-[var(--s-3)]';

/** HairlineRule's row, shared so the skeleton cannot drift from the ticket. */
export const TICKET_RULE_ROW =
  'flex items-center gap-[var(--s-3)] pt-[var(--s-3)] pb-[var(--s-1)] first:pt-0';

/** Progression band under the head. Chrome: outside the scroll region. */
export const DETAIL_RIBBON_BAND =
  'shrink-0 border-b border-[var(--line)] bg-[var(--surface)] ' +
  'px-[var(--s-4)] md:px-[var(--s-6)] py-[var(--s-2)]';
