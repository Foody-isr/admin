// Browser-based ticket printing for the order drawer.
//
// Thermal printing in Foody happens in the FoodyPOS app (it talks ESC/POS to
// the local printer). The cloud server can't reach a printer on the
// restaurant's LAN, so for the web admin we print via the browser: we render a
// self-contained 80mm ticket into a hidden iframe and call window.print(),
// which routes to whatever printer the staff machine has installed (including a
// thermal printer via its OS driver).
//
// Two ticket kinds, mirroring a POS:
//   - 'receipt'  → customer receipt: items WITH prices + total (same content as
//                  foodyweb's /receipt page).
//   - 'kitchen'  → production ticket: items / qty / modifiers / notes, NO prices.
//
// Item grouping (categories + combos) mirrors the drawer in
// app/[restaurantId]/orders/all/page.tsx and foodyweb's ReceiptClient.

import type { Order, OrderItem } from '@/lib/api';

export type TicketKind = 'receipt' | 'kitchen';

export interface PrintTicketRestaurant {
  name?: string;
  address?: string;
  phone?: string;
}

export interface PrintTicketLabels {
  receiptHeading: string;
  kitchenHeading: string;
  orderNumber: string; // already substituted, e.g. "Commande #448"
  date: string;
  type: string;
  typeValue: string; // localized order type
  table: string;
  customer: string;
  phone: string;
  total: string;
  uncategorized: string;
  comboFallback: string;
}

export interface PrintTicketOptions {
  order: Order;
  kind: TicketKind;
  restaurant?: PrintTicketRestaurant;
  labels: PrintTicketLabels;
  locale?: string;
  dir?: 'ltr' | 'rtl';
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  return '₪' + (n ?? 0).toFixed(2);
}

// ─── Grouping (mirrors the drawer / foodyweb receipt) ────────────────────────

interface GroupedOrder {
  categoryGroups: Array<{ label: string; items: OrderItem[] }>;
  comboGroups: Array<{ name: string; items: OrderItem[]; price: number }>;
  subtotal: number;
  total: number;
}

function groupOrder(order: Order, labels: PrintTicketLabels): GroupedOrder {
  const allItems: OrderItem[] = order.items ?? [];
  const regularItems = allItems.filter((i) => !i.combo_group);

  const comboMap = new Map<string, OrderItem[]>();
  for (const item of allItems) {
    if (item.combo_group) {
      const g = comboMap.get(item.combo_group) ?? [];
      g.push(item);
      comboMap.set(item.combo_group, g);
    }
  }
  const comboEntries = Array.from(comboMap.values());

  // Category grouping, first-seen order; uncategorized rows fall to the end.
  const order_: string[] = [];
  const byCat = new Map<string, OrderItem[]>();
  for (const it of regularItems) {
    const key = it.category_name && it.category_name.trim() !== '' ? it.category_name : '__other__';
    if (!byCat.has(key)) {
      byCat.set(key, []);
      order_.push(key);
    }
    byCat.get(key)!.push(it);
  }
  const otherIdx = order_.indexOf('__other__');
  if (otherIdx >= 0 && order_.length > 1) {
    order_.splice(otherIdx, 1);
    order_.push('__other__');
  }
  const categoryGroups = order_.map((key) => ({
    label: key === '__other__' ? labels.uncategorized : key,
    items: byCat.get(key)!,
  }));

  // Combo pricing: combo_price from server, else split the remainder of the
  // order total evenly across combos (older clients).
  const regularTotal = regularItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const comboDeltasTotal = comboEntries.reduce(
    (s, items) => s + items.reduce((gs, i) => gs + i.price * i.quantity, 0),
    0,
  );
  const remainingForCombos = Math.max(0, (order.total_amount ?? 0) - regularTotal - comboDeltasTotal);
  const comboCount = comboEntries.length;
  const priceFor = (items: OrderItem[]): number => {
    const fromServer = items[0]?.combo_price;
    if (fromServer && fromServer > 0) return fromServer;
    return comboCount > 0 ? remainingForCombos / comboCount : 0;
  };

  const comboGroups = comboEntries.map((items) => {
    const deltas = items.reduce((gs, i) => gs + i.price * i.quantity, 0);
    return {
      name: items[0]?.combo_name || labels.comboFallback,
      items,
      price: priceFor(items) + deltas,
    };
  });

  const combosSubtotal = comboGroups.reduce((s, g) => s + g.price, 0);
  const subtotal = regularTotal + combosSubtotal;

  return { categoryGroups, comboGroups, subtotal, total: order.total_amount ?? subtotal };
}

// ─── Item rendering helpers ──────────────────────────────────────────────────

function modifiersHtml(item: OrderItem, withPrice: boolean): string {
  if (!item.modifiers || item.modifiers.length === 0) return '';
  const parts = item.modifiers.map((m) => {
    const sign = m.action === 'add' ? '+' : '−';
    const price =
      withPrice && m.price_delta
        ? ` (${m.price_delta > 0 ? '+' : ''}${m.price_delta.toFixed(2)})`
        : '';
    return `${sign}${esc(m.name)}${price}`;
  });
  return `<div class="sub">${parts.join(' · ')}</div>`;
}

function itemNameHtml(item: OrderItem): string {
  const variant = item.selected_variant_name ? ` — ${esc(item.selected_variant_name)}` : '';
  return `${esc(item.name)}${variant}`;
}

function noteHtml(item: OrderItem): string {
  return item.notes ? `<div class="note">“${esc(item.notes)}”</div>` : '';
}

// ─── Receipt (with prices) ───────────────────────────────────────────────────

function renderReceiptBody(order: Order, labels: PrintTicketLabels): string {
  const g = groupOrder(order, labels);
  const rows: string[] = [];

  for (const cat of g.categoryGroups) {
    rows.push(`<div class="cat">${esc(cat.label)}</div>`);
    for (const item of cat.items) {
      const line = item.price * item.quantity;
      rows.push(
        `<div class="row"><span class="qty">${item.quantity}×</span>` +
          `<span class="name">${itemNameHtml(item)}${modifiersHtml(item, true)}${noteHtml(item)}</span>` +
          `<span class="price">${money(line)}</span></div>`,
      );
    }
  }

  for (const combo of g.comboGroups) {
    rows.push(`<div class="cat">${esc(labels.comboFallback)}</div>`);
    rows.push(
      `<div class="row"><span class="qty"></span>` +
        `<span class="name">${esc(combo.name)}</span>` +
        `<span class="price">${money(combo.price)}</span></div>`,
    );
    for (const ci of combo.items) {
      const delta = ci.price * ci.quantity;
      rows.push(
        `<div class="row sub-row"><span class="qty"></span>` +
          `<span class="name">↳ ${ci.quantity > 1 ? `${ci.quantity}× ` : ''}${itemNameHtml(ci)}` +
          `${delta > 0 ? ` (+${delta.toFixed(2)})` : ''}</span>` +
          `<span class="price"></span></div>`,
      );
    }
  }

  return (
    `<div class="items">${rows.join('')}</div>` +
    `<div class="totals">` +
    `<div class="row total"><span class="name">${esc(labels.total)}</span>` +
    `<span class="price">${money(g.total)}</span></div>` +
    `</div>`
  );
}

// ─── Kitchen ticket (no prices, big) ─────────────────────────────────────────

function renderKitchenBody(order: Order, labels: PrintTicketLabels): string {
  const g = groupOrder(order, labels);
  const rows: string[] = [];

  for (const cat of g.categoryGroups) {
    rows.push(`<div class="cat">${esc(cat.label)}</div>`);
    for (const item of cat.items) {
      rows.push(
        `<div class="krow"><span class="kqty">${item.quantity}×</span>` +
          `<span class="kname">${itemNameHtml(item)}${modifiersHtml(item, false)}${noteHtml(item)}</span></div>`,
      );
    }
  }

  for (const combo of g.comboGroups) {
    rows.push(`<div class="cat">${esc(labels.comboFallback)}</div>`);
    rows.push(`<div class="krow"><span class="kqty"></span><span class="kname">${esc(combo.name)}</span></div>`);
    for (const ci of combo.items) {
      rows.push(
        `<div class="krow sub-row"><span class="kqty"></span>` +
          `<span class="kname">↳ ${ci.quantity > 1 ? `${ci.quantity}× ` : ''}${itemNameHtml(ci)}` +
          `${modifiersHtml(ci, false)}${noteHtml(ci)}</span></div>`,
      );
    }
  }

  return `<div class="items kitchen">${rows.join('')}</div>`;
}

// ─── Document shell + print ──────────────────────────────────────────────────

function buildDoc(opts: PrintTicketOptions): string {
  const { order, kind, restaurant, labels, locale, dir = 'ltr' } = opts;
  const isKitchen = kind === 'kitchen';

  const dateStr = (() => {
    try {
      return new Date(order.created_at).toLocaleString(locale || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return order.created_at;
    }
  })();

  const heading = isKitchen ? labels.kitchenHeading : labels.receiptHeading;

  const headerLines: string[] = [];
  if (!isKitchen && restaurant?.name) {
    headerLines.push(`<div class="rname">${esc(restaurant.name)}</div>`);
    if (restaurant.address) headerLines.push(`<div class="rmeta">${esc(restaurant.address)}</div>`);
    if (restaurant.phone) headerLines.push(`<div class="rmeta">${esc(restaurant.phone)}</div>`);
  }

  const metaRows: string[] = [];
  metaRows.push(`<div class="meta"><span>${esc(labels.orderNumber)}</span></div>`);
  metaRows.push(`<div class="meta"><span>${esc(labels.date)}</span><span>${esc(dateStr)}</span></div>`);
  metaRows.push(`<div class="meta"><span>${esc(labels.type)}</span><span>${esc(labels.typeValue)}</span></div>`);
  if (order.table_code || order.table_number) {
    metaRows.push(
      `<div class="meta"><span>${esc(labels.table)}</span><span>${esc(order.table_code || order.table_number)}</span></div>`,
    );
  }
  if (order.customer_name) {
    metaRows.push(`<div class="meta"><span>${esc(labels.customer)}</span><span>${esc(order.customer_name)}</span></div>`);
  }
  if (!isKitchen && order.customer_phone) {
    metaRows.push(`<div class="meta"><span>${esc(labels.phone)}</span><span>${esc(order.customer_phone)}</span></div>`);
  }

  const body = isKitchen ? renderKitchenBody(order, labels) : renderReceiptBody(order, labels);

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${esc(locale || 'en')}">
<head>
<meta charset="utf-8" />
<title>${esc(labels.orderNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 72mm;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .heading { text-align: center; font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  .rname { text-align: center; font-size: 14px; font-weight: 700; }
  .rmeta { text-align: center; font-size: 11px; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
  .meta span:first-child { color: #000; opacity: 0.7; }
  .items { margin-top: 4px; }
  .cat { font-weight: 700; text-transform: uppercase; font-size: 11px; margin: 8px 0 2px; border-bottom: 1px solid #000; }
  .row { display: flex; align-items: flex-start; gap: 6px; margin: 3px 0; }
  .row .qty { flex: 0 0 auto; min-width: 22px; font-weight: 700; }
  .row .name { flex: 1 1 auto; }
  .row .price { flex: 0 0 auto; text-align: right; white-space: nowrap; }
  .row.sub-row .name { padding-left: 10px; opacity: 0.85; }
  .sub { font-size: 10px; opacity: 0.85; }
  .note { font-size: 10px; font-style: italic; }
  .totals { border-top: 1px dashed #000; margin-top: 6px; padding-top: 6px; }
  .row.total { font-size: 14px; font-weight: 700; }
  /* Kitchen ticket: larger, no prices */
  .kitchen .krow { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; font-size: 15px; }
  .kitchen .kqty { flex: 0 0 auto; min-width: 30px; font-weight: 700; }
  .kitchen .kname { flex: 1 1 auto; font-weight: 600; }
  .kitchen .krow.sub-row .kname { padding-left: 12px; font-weight: 500; }
  .kitchen .sub { font-size: 12px; font-weight: 400; opacity: 1; }
  .kitchen .note { font-size: 12px; font-weight: 700; }
  .foot { text-align: center; font-size: 10px; margin-top: 10px; }
</style>
</head>
<body>
  <div class="heading">${esc(heading)}</div>
  ${headerLines.join('')}
  <div class="hr"></div>
  ${metaRows.join('')}
  <div class="hr"></div>
  ${body}
  <div class="foot">Foody</div>
</body>
</html>`;
}

/**
 * Render an order ticket into a hidden iframe and open the browser print
 * dialog. Returns once printing has been triggered; the iframe is cleaned up
 * automatically afterwards.
 */
export function printOrderTicket(opts: PrintTicketOptions): void {
  if (typeof window === 'undefined') return;

  const html = buildDoc(opts);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Delay removal so the print job has time to spool before the document goes
    // away (some browsers cancel the job if the source is removed immediately).
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* already removed */
      }
    }, 1000);
  };

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      win.focus();
      win.onafterprint = cleanup;
      win.print();
      // Fallback cleanup in case onafterprint never fires (e.g. dialog cancelled
      // without an event on some browsers).
      window.setTimeout(cleanup, 60_000);
    } catch {
      cleanup();
    }
  };

  // Give the iframe a tick to lay out before printing.
  if (doc.readyState === 'complete') {
    window.setTimeout(doPrint, 60);
  } else {
    win.onload = () => window.setTimeout(doPrint, 60);
  }
}
