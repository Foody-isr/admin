'use client';

// One template's body editor, for a single language: the Textarea, the token
// insertion bar, the unknown-token warnings, and a live preview.
//
// The preview is what makes this screen usable rather than a blind guess: half
// of the message is generated content (item list, totals, address) that only
// exists once an order runs through buildOrderRecap(). So this file carries a
// fixed sample order, rich enough that every block the template can render has
// something to show — two regular items (one with a variant and a modifier), a
// combo, a delivery address with a fee, a discount, and a tracking link.

import { useMemo, useRef } from 'react';
import { Chip, Textarea } from '@/components/ds';
import { useI18n, i18nOr } from '@/lib/i18n';
import { unknownTokens, type TemplateDefinition } from '@/lib/messages/registry';
import { spliceToken } from '@/lib/messages/insert-token';
import { buildOrderRecap, type RecapLocale } from '@/lib/orders/whatsapp-recap';
import { buildDeliveryReminder } from '@/lib/orders/delivery-reminder';
import { receiptShareUrl } from '@/lib/receipt-share';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/api';

// ─── Sample order — fixed, local to this file, never sent anywhere ──────────
const SAMPLE_RESTAURANT_NAME = 'Chez Foody';

const SAMPLE_ORDER: Order = {
  id: 4821,
  restaurant_id: 0,
  order_type: 'delivery',
  status: 'accepted',
  payment_status: 'paid',
  customer_name: 'Noa Levi',
  customer_phone: '+972501234567',
  total_amount: 112,
  created_at: '2026-08-06T09:00:00.000Z',
  scheduled_for: '2026-08-13T11:00:00.000Z',
  scheduled_pickup_window_start: '11:00',
  scheduled_pickup_window_end: '13:00',
  delivery_address: 'Rothschild 12',
  delivery_city: 'Tel Aviv',
  delivery_floor: '3',
  delivery_apt: '5',
  delivery_entry_code: '1234',
  delivery_fee: 15,
  discount_amount: 10,
  receipt_token: 'sample-preview-token',
  items: [
    // Regular item #1 — variant (absolute price) + two modifiers.
    {
      id: 1,
      menu_item_id: 101,
      name: 'Salade Tuna',
      price: 35,
      quantity: 1,
      category_id: 1,
      category_name: 'Salades',
      selected_variant_id: 5,
      selected_variant_name: 'Large',
      selected_variant_price: 35,
      modifiers: [
        { id: 1, order_item_id: 1, menu_item_modifier_id: 1, name: 'Sans oignons', action: 'remove', price_delta: 0 },
        { id: 2, order_item_id: 1, menu_item_modifier_id: 2, name: 'Supplément sauce', action: 'add', price_delta: 2 },
      ],
    },
    // Regular item #2 — plain, quantity 2.
    {
      id: 2,
      menu_item_id: 102,
      name: 'Coca Cola',
      price: 12,
      quantity: 2,
      category_id: 2,
      category_name: 'Boissons',
    },
    // Combo — two steps sharing combo_group; base price lives on combo_price,
    // step rows are priced at their delta only (0 for the standard pick).
    {
      id: 3,
      menu_item_id: 103,
      name: 'Burger Cheese',
      price: 0,
      quantity: 1,
      combo_group: 'combo-1',
      combo_name: 'Menu Duo',
      combo_price: 45,
    },
    {
      id: 4,
      menu_item_id: 104,
      name: 'Frites (grande)',
      price: 3,
      quantity: 1,
      combo_group: 'combo-1',
      combo_name: 'Menu Duo',
      combo_price: 45,
    },
  ],
};

interface TemplateEditorProps {
  definition: TemplateDefinition;
  /** Which language of the template body this editor instance edits. */
  locale: RecapLocale;
  body: string;
  onChange: (body: string) => void;
  readOnly?: boolean;
}

export function TemplateEditor({ definition, locale, body, onChange, readOnly }: TemplateEditorProps) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Inserts a token where the cursor sits, replacing the current selection.
  // Without restoring focus and repositioning the caret, inserting two tokens
  // in a row would force the owner to click back into the field in between.
  // The actual string math (spliceToken) is a pure function tested on its
  // own in insert-token.test.ts; everything here is DOM plumbing that can't
  // be unit-tested without a browser (reading the live selection, restoring
  // focus, scheduling the caret move for after React re-renders the value).
  const insertToken = (name: string) => {
    const el = areaRef.current;
    const token = `{{${name}}}`;
    if (!el) {
      onChange(body + token);
      return;
    }

    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const { next, caret } = spliceToken(body, start, end, token);
    onChange(next);

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const unknown = useMemo(() => unknownTokens(body, definition), [body, definition]);

  const preview = useMemo(
    () => definition.key === 'delivery_reminder'
      ? buildDeliveryReminder({
          order: SAMPLE_ORDER,
          restaurantName: SAMPLE_RESTAURANT_NAME,
          locale,
          body,
        })
      : buildOrderRecap({
          order: SAMPLE_ORDER,
          restaurantName: SAMPLE_RESTAURANT_NAME,
          locale,
          receiptUrl: receiptShareUrl(SAMPLE_ORDER.receipt_token),
          body,
        }),
    [body, definition.key, locale],
  );

  const placeholders = [...definition.tokens, ...definition.blocks];
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <Textarea
        ref={areaRef}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        // `readOnly`, not `disabled`: a staff member without settings.edit
        // still needs to select and copy the message text. `disabled` would
        // block selection along with editing; `readOnly` blocks only editing.
        // The dimmed look `disabled` gets for free from the design system's
        // `disabled:opacity-50` is reproduced manually here since it doesn't
        // have a `read-only:` counterpart.
        readOnly={readOnly}
        dir={dir}
        rows={10}
        className={cn('font-mono', readOnly && 'opacity-70 cursor-default bg-[var(--surface-2)]')}
      />

      <div>
        <div className="text-fs-xs font-semibold text-[var(--fg-muted)] mb-1.5">
          {t('messageTemplatesTokens')}
        </div>
        <div className="flex flex-wrap gap-[var(--s-2)]">
          {placeholders.map((name) => (
            <Chip
              key={name}
              onClick={() => insertToken(name)}
              disabled={readOnly}
              className={readOnly ? 'opacity-50 cursor-not-allowed' : undefined}
            >
              {i18nOr(t, `token_${name}`, name)}
            </Chip>
          ))}
        </div>
      </div>

      {unknown.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unknown.map((name) => (
            <li key={name} className="text-fs-xs text-[var(--danger-500)]">
              {t('messageTemplatesUnknownToken').replace('{t}', name)}
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="text-fs-xs font-semibold text-[var(--fg-muted)] mb-1.5">
          {t('messageTemplatesPreview')}
        </div>
        <div
          dir={dir}
          className="whitespace-pre-wrap rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)] text-fs-sm leading-relaxed text-[var(--fg)]"
        >
          {preview}
        </div>
      </div>
    </div>
  );
}
