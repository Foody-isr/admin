# Send Receipt to Customer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff send a customer their order receipt directly from the order drawer, via WhatsApp or email, in one tap.

**Architecture:** Frontend-only change in foodyadmin. A new "Envoyer au client" dropdown in the order-drawer footer builds device deep-links (`wa.me` / `mailto`) pre-filled with a short summary + a link to the already-existing hosted receipt page (`foodyweb /receipt/[token]`). Pure link/message builders live in a small `src/lib/receipt-share.ts` so the component stays thin. No backend, model, or API-client changes — the order payload already carries `receipt_token`, `customer_email`, and `customer_phone`.

**Tech Stack:** Next.js 14 / React, TypeScript, Tailwind, lucide-react icons, the existing `useI18n()` hook and `Button` design-system component.

## Global Constraints

- **Frontend-only (foodyadmin).** No changes to foodyserver, models, migrations, or the API client's request logic. The only `api.ts` change is adding two optional fields to the `Order` **type**.
- **No em dash (`—`) as a separator** in any UI label or customer-facing copy (project convention). Use natural phrasing.
- **Reuse, don't duplicate:** phone normalization is `(phone || '').replace(/\D/g, '')` (already used by the payment-link button); the dropdown markup mirrors the existing `PrintTicketMenu`; the copy-link confirmation reuses the existing i18n keys `copyLink` / `linkCopied`.
- **i18n parity is enforced.** Every new key MUST be added to all three locale blocks (en, he, fr) in `src/lib/i18n.tsx` or `npm run check:i18n` fails.
- **Receipt URL base:** `process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'` (same default used across foodyadmin).
- **Validation for every task:** `npm run lint && npx tsc --noEmit && npm run check:i18n` from the `foodyadmin/` directory. foodyadmin has no unit-test runner (no jest/vitest/RTL); this is the established validation path (CLAUDE.md §5). UI behavior is verified manually per the steps below.
- **Git:** commit directly to `develop` (repo default; do not create a feature branch). Do **not** push — the user pushes when ready. Stage only the explicit files listed in each task (the user co-edits these repos live).

## File Structure

- **Create** `src/lib/receipt-share.ts` — pure, framework-free helpers that build the receipt URL, the share message (token substitution), the `wa.me` link, and the `mailto:` link. One responsibility: turn an order's data + resolved label strings into share links. No React, no i18n imports (the component passes already-resolved strings in), so it is trivially correct and type-checked.
- **Modify** `src/lib/api.ts` — add `receipt_token?: string` and `customer_email?: string` to the `Order` interface (both already returned by the server, just untyped).
- **Modify** `src/lib/i18n.tsx` — add 5 new keys to each of the en / he / fr blocks.
- **Modify** `src/components/orders/OrderDetailDrawer.tsx` — add a `SendToCustomerMenu` component (mirrors `PrintTicketMenu`) and render it next to `PrintTicketMenu` in the footer; extend the lucide import.

---

### Task 1: Foundations — Order type fields, i18n keys, pure share helpers

Non-UI groundwork consumed by Task 2. Fully verified by `typecheck` (types + pure helpers compile and are referenced correctly) and `check:i18n` (locale parity).

**Files:**
- Modify: `src/lib/api.ts` (Order interface, around line 498-540)
- Modify: `src/lib/i18n.tsx` (en block near line 2825; he block near line 5799; fr block near line 8772)
- Create: `src/lib/receipt-share.ts`

**Interfaces:**
- Produces (for Task 2):
  - `Order.receipt_token?: string`, `Order.customer_email?: string` (types)
  - i18n keys: `sendToCustomer`, `sendReceiptWhatsApp`, `sendReceiptEmail`, `receiptShareMessage`, `receiptEmailSubject` (in all 3 locales)
  - `receiptShareUrl(token: string | undefined | null): string`
  - `buildShareMessage(opts: { template: string; name?: string; id: number; total: number; url: string }): string`
  - `buildWhatsAppUrl(phone: string | undefined, text: string): string`
  - `buildMailtoUrl(email: string | undefined, subject: string, body: string): string`

- [ ] **Step 1: Add the two fields to the `Order` type**

In `src/lib/api.ts`, inside `export interface Order { ... }`, add these two lines directly after `custom_fields?: ...` (i.e. just before the closing `}` at line 540):

```ts
  // Public receipt page token (foodyweb /receipt/[token]). Set at order creation;
  // absent only on very old orders that predate tokenization.
  receipt_token?: string;
  // Optional confirmation email captured at checkout (e.g. Google sign-in). May be absent.
  customer_email?: string;
```

- [ ] **Step 2: Create the pure share helpers**

Create `src/lib/receipt-share.ts` with exactly this content:

```ts
// Pure helpers for sharing an order receipt with the customer via device
// deep-links (WhatsApp / email). Framework-free and side-effect-free so the
// order drawer stays thin and these stay trivially correct. The component
// resolves i18n strings and passes them in; nothing here imports React or i18n.

/** Base URL of the guest-facing foodyweb app, where the receipt page lives. */
export const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

/** Public receipt page URL for an order, or '' when the order has no token. */
export function receiptShareUrl(token: string | undefined | null): string {
  return token ? `${WEB_BASE_URL}/receipt/${token}` : '';
}

/**
 * Fill the share-message template. Tokens: {name} {id} {total} {url}.
 * {name} is injected WITH a leading space (or '' when absent) so the greeting
 * reads cleanly with or without a customer name (template has "Bonjour{name},").
 * Trailing whitespace (e.g. when there is no url) is trimmed off.
 */
export function buildShareMessage(opts: {
  template: string;
  name?: string;
  id: number;
  total: number;
  url: string;
}): string {
  const rawName = (opts.name || '').trim();
  const namePart = rawName ? ` ${rawName}` : '';
  return opts.template
    .replace('{name}', namePart)
    .replace('{id}', String(opts.id))
    .replace('{total}', opts.total.toFixed(2))
    .replace('{url}', opts.url)
    .trim();
}

/** wa.me deep link, or '' when the phone has no usable digits. */
export function buildWhatsAppUrl(phone: string | undefined, text: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** mailto: link. `email` may be '' so the To field is left blank for staff to type. */
export function buildMailtoUrl(
  email: string | undefined,
  subject: string,
  body: string,
): string {
  const to = (email || '').trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 3: Add the English i18n keys**

In `src/lib/i18n.tsx`, in the **English** block, directly after the line `printKitchenTicket: 'Kitchen ticket',` (near line 2827), add:

```ts
    sendToCustomer: 'Send to customer',
    sendReceiptWhatsApp: 'Send via WhatsApp',
    sendReceiptEmail: 'Send via email',
    receiptShareMessage: 'Hello{name}, here is the receipt for your order #{id} for ₪{total}. {url}',
    receiptEmailSubject: 'Receipt for your order #{id}',
```

- [ ] **Step 4: Add the Hebrew i18n keys**

In the **Hebrew** block, directly after `printKitchenTicket: 'טיקט מטבח',` (near line 5801), add:

```ts
    sendToCustomer: 'שליחה ללקוח',
    sendReceiptWhatsApp: 'שליחה בוואטסאפ',
    sendReceiptEmail: 'שליחה במייל',
    receiptShareMessage: 'שלום{name}, הנה הקבלה עבור הזמנה #{id} בסך ₪{total}. {url}',
    receiptEmailSubject: 'קבלה עבור הזמנה #{id}',
```

- [ ] **Step 5: Add the French i18n keys**

In the **French** block, directly after `printKitchenTicket: 'Ticket cuisine',` (near line 8774), add:

```ts
    sendToCustomer: 'Envoyer au client',
    sendReceiptWhatsApp: 'Envoyer par WhatsApp',
    sendReceiptEmail: 'Envoyer par email',
    receiptShareMessage: "Bonjour{name}, voici le reçu de votre commande #{id} d'un montant de ₪{total}. {url}",
    receiptEmailSubject: 'Reçu de votre commande #{id}',
```

- [ ] **Step 6: Validate types + i18n parity**

Run: `cd foodyadmin && npx tsc --noEmit && npm run check:i18n`
Expected: tsc reports no errors; the i18n checker reports the locales are in sync (the 5 new keys present in en/he/fr). If the checker lists a missing key, add it to the locale it flags.

- [ ] **Step 7: Commit**

```bash
cd foodyadmin
git add src/lib/api.ts src/lib/i18n.tsx src/lib/receipt-share.ts
git commit -m "feat(orders): add receipt-share helpers, i18n keys, and order type fields

Groundwork for the 'Send to customer' action: pure wa.me/mailto/receipt-url
builders, fr/en/he strings, and receipt_token/customer_email on the Order type
(both already returned by the server).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: "Envoyer au client" dropdown in the order drawer

Adds the UI: a footer dropdown mirroring `PrintTicketMenu`, offering WhatsApp / email / copy-link, wired to the Task 1 helpers.

**Files:**
- Modify: `src/components/orders/OrderDetailDrawer.tsx` (import at line 9-14; footer render at line 530; new component near `PrintTicketMenu` at line 1253-1303)

**Interfaces:**
- Consumes (from Task 1): `receiptShareUrl`, `buildShareMessage`, `buildWhatsAppUrl`, `buildMailtoUrl` from `@/lib/receipt-share`; the `Order` type fields `receipt_token` / `customer_email`; i18n keys `sendToCustomer`, `sendReceiptWhatsApp`, `sendReceiptEmail`, `receiptShareMessage`, `receiptEmailSubject`, plus existing `copyLink` / `linkCopied`.
- Produces: a `SendToCustomerMenu` component rendered in the drawer footer.

- [ ] **Step 1: Extend the lucide-react import**

In `src/components/orders/OrderDetailDrawer.tsx`, change the icon import block (lines 9-14) so it also imports `SendIcon` and `MailIcon`. The block becomes:

```tsx
import {
  XIcon, PrinterIcon, ChevronDownIcon,
  CreditCardIcon, CheckCircle2Icon,
  CheckIcon, ClockIcon, GlobeIcon, EditIcon,
  CopyIcon, MessageCircleIcon, LinkIcon, Trash2Icon, MapPinIcon,
  SendIcon, MailIcon,
} from 'lucide-react';
```

- [ ] **Step 2: Import the share helpers**

Directly below the existing `import { printOrderTicket, ... } from '@/lib/print-ticket';` line (line 17), add:

```tsx
import {
  receiptShareUrl,
  buildShareMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from '@/lib/receipt-share';
```

- [ ] **Step 3: Add the `SendToCustomerMenu` component**

In the same file, directly after the closing `}` of `PrintTicketMenu` (line 1303), append this new component:

```tsx
// ─── Send To Customer Menu ───────────────────────────────────────────────────
// Lets staff send the customer their receipt without downloading + re-uploading:
// WhatsApp / email device deep-links pre-filled with a short summary + a link to
// the hosted receipt page, plus a copy-link shortcut. Mirrors PrintTicketMenu.
// No backend call — the receipt link is built from the order's receipt_token.

function SendToCustomerMenu({ order }: { order: Order }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const url = receiptShareUrl(order.receipt_token);
  const body = buildShareMessage({
    template: t('receiptShareMessage'),
    name: order.customer_name,
    id: order.id,
    total: order.total_amount ?? 0,
    url,
  });
  const subject = t('receiptEmailSubject').replace('{id}', String(order.id));
  const waUrl = buildWhatsAppUrl(order.customer_phone, body);
  const mailUrl = buildMailtoUrl(order.customer_email, subject, body);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays available via the other actions */
    }
  };

  const itemClass =
    'flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors';

  return (
    <div className="relative flex-1 md:flex-none" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="w-full md:w-auto justify-center"
      >
        <SendIcon /> {t('sendToCustomer') || 'Envoyer au client'}
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 rounded-standard py-1 min-w-[220px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <MessageCircleIcon className="size-4" />
              {t('sendReceiptWhatsApp') || 'Envoyer par WhatsApp'}
            </a>
          )}
          <a href={mailUrl} onClick={() => setOpen(false)} className={itemClass}>
            <MailIcon className="size-4" />
            {t('sendReceiptEmail') || 'Envoyer par email'}
          </a>
          <button
            onClick={copyLink}
            disabled={!url}
            className={`${itemClass} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {copied ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
            {copied ? (t('linkCopied') || 'Lien copié') : (t('copyLink') || 'Copier le lien')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render it in the footer next to the print menu**

In the footer, find the line `<PrintTicketMenu onSelect={handlePrint} />` (line 530) and add the new menu right after it, so both sit in the same left-hand button group:

```tsx
            <PrintTicketMenu onSelect={handlePrint} />
            <SendToCustomerMenu order={order} />
```

- [ ] **Step 5: Validate lint + types + i18n**

Run: `cd foodyadmin && npm run lint && npx tsc --noEmit && npm run check:i18n`
Expected: all three pass with no errors. (Common catch: an unused import or a missing i18n key — fix and re-run.)

- [ ] **Step 6: Manual verification**

Run `cd foodyadmin && npm run dev` (port 3003), open an order in the orders board so the drawer appears, and confirm:
- The footer shows **Envoyer au client** next to **Imprimer le ticket**; clicking it opens a dropdown with WhatsApp / email / copy-link options.
- **Envoyer par WhatsApp** (on an order that has a phone) opens `wa.me/<digits>` pre-filled with `Bonjour <name>, voici le reçu de votre commande #<id> d'un montant de ₪<total>. <link>`, and the link resolves to the receipt page.
- **Envoyer par email** opens the mail client with the subject and the same body; when the order has `customer_email`, the To field is pre-filled.
- **Copier le lien** copies the receipt URL and the label flips to "Lien copié" briefly.
- On an order with no phone, the WhatsApp option is absent.
- Switch the admin language to Hebrew and English and confirm the labels/message localize (and RTL keeps the dropdown usable).

- [ ] **Step 7: Commit**

```bash
cd foodyadmin
git add src/components/orders/OrderDetailDrawer.tsx
git commit -m "feat(orders): add 'Envoyer au client' receipt-share dropdown

WhatsApp / email / copy-link actions in the order drawer footer, sending the
customer a short summary + a link to the hosted receipt page. Device deep-links
(wa.me / mailto), no backend. Reuses the payment-link share pattern.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** WhatsApp (Task 2 §3), email (Task 2 §3), copy-link (Task 2 §3), short-summary-plus-link content (Task 1 `receiptShareMessage` + `buildShareMessage`), separate dropdown placement (Task 2 §4), no-phone gating (Task 2 `waUrl &&`), no-token degrade + disabled copy (Task 1 `receiptShareUrl` returns '' → Task 2 `disabled={!url}` and url-less body), fr/en/he i18n (Task 1 §3-5), frontend-only + reuse (Global Constraints). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** helper names (`receiptShareUrl`, `buildShareMessage`, `buildWhatsAppUrl`, `buildMailtoUrl`) and their signatures are identical between the Task 1 definitions and the Task 2 call sites; i18n key names match between Task 1 additions and Task 2 usage.
- **Deviation (documented):** no TDD unit tests because foodyadmin has no test runner (CLAUDE.md §5 validates web/admin via lint + tsc only). Logic is isolated in pure, type-checked helpers; behavior is verified via `check:i18n` + the manual pass in Task 2 §6.
