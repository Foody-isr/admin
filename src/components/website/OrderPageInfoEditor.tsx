'use client';

import { useState } from 'react';
import type { OrderPageInfo, OrderPageBarItem, OrderPageModalSection } from '@/lib/api';

type Mode = 'pickup' | 'delivery' | 'dine_in';

// Defaults mirror foodyweb (lib/orderPageInfo.ts) so the editor starts from the
// same item set the customer page falls back to when nothing is configured.
const DEFAULT_INFO: OrderPageInfo = {
  bar: {
    pickup: ['batch_week', 'hours', 'min_order', 'fulfilment_time', 'more'],
    delivery: ['batch_week', 'hours', 'min_order', 'fulfilment_time', 'more'],
    dine_in: ['batch_week', 'hours', 'wifi', 'more'],
  },
  modal: ['about', 'hours', 'address', 'contact', 'social'],
  modal_text: '',
};

const MODE_LABEL: Record<Mode, string> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
  dine_in: 'Sur place',
};

const SHARED_BAR: { key: OrderPageBarItem; label: string }[] = [
  { key: 'batch_week', label: 'Pré-commande / semaine' },
  { key: 'hours', label: 'Horaires (Ouvert · 22:00)' },
];
const SOCIAL_BAR: { key: OrderPageBarItem; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
];
// The "Plus" button (opens the modal) — offered for every mode, shown last.
const MORE_BAR: { key: OrderPageBarItem; label: string }[] = [
  { key: 'more', label: 'Bouton « Plus » (ouvre la fenêtre)' },
];
// Only the items that actually render for each mode are offered.
const BAR_ITEMS: Record<Mode, { key: OrderPageBarItem; label: string }[]> = {
  pickup: [
    ...SHARED_BAR,
    { key: 'min_order', label: 'Commande minimum' },
    { key: 'fulfilment_time', label: 'Délai de préparation' },
    ...SOCIAL_BAR,
    ...MORE_BAR,
  ],
  delivery: [
    ...SHARED_BAR,
    { key: 'min_order', label: 'Commande minimum' },
    { key: 'fulfilment_time', label: 'Délai de livraison' },
    ...SOCIAL_BAR,
    ...MORE_BAR,
  ],
  dine_in: [...SHARED_BAR, { key: 'wifi', label: 'WiFi' }, ...SOCIAL_BAR, ...MORE_BAR],
};

const MODAL_SECTIONS: { key: OrderPageModalSection; label: string }[] = [
  { key: 'about', label: 'À propos (texte)' },
  { key: 'hours', label: 'Horaires (semaine complète)' },
  { key: 'address', label: 'Adresse + itinéraire' },
  { key: 'contact', label: 'Contact (tél., email)' },
  { key: 'social', label: 'Réseaux sociaux' },
  { key: 'custom_text', label: 'Texte personnalisé' },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-brand-500' : 'bg-[var(--divider)]'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-[var(--divider)] first:border-t-0">
      <span className="text-[13px]">{label}</span>
      <Toggle on={on} onClick={onToggle} />
    </div>
  );
}

/**
 * Configures which restaurant-info items show in the order page's metadata bar
 * (per order mode) and which sections show in the "Plus" modal. Writes the full
 * OrderPageInfo on the first edit (starting from the defaults).
 */
export function OrderPageInfoEditor({
  value,
  onChange,
  availableModes,
  locked,
}: {
  value: OrderPageInfo | null;
  onChange: (v: OrderPageInfo) => void;
  /** Order modes the restaurant enables, pickup-first (the menu-page default). */
  availableModes: Mode[];
  /** True when the order type is chosen at checkout (the menu page shows one
   *  fixed default bar, so per-mode tabs don't apply). */
  locked: boolean;
}) {
  const modes = availableModes.length ? availableModes : (['pickup'] as Mode[]);
  // One fixed bar when the customer can't switch mode on the page (locked) or
  // only one mode exists — otherwise tabs for each switchable mode.
  const single = locked || modes.length <= 1;
  const [selected, setSelected] = useState<Mode>(modes[0]);
  const mode: Mode = single ? modes[0] : modes.includes(selected) ? selected : modes[0];
  const v = value ?? DEFAULT_INFO;

  const toggleBar = (key: OrderPageBarItem) => {
    const list = v.bar[mode];
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    // When the bar is fixed (single), keep all modes in sync so it shows the
    // same thing whichever mode foodyweb defaults to.
    const bar = single ? { pickup: next, delivery: next, dine_in: next } : { ...v.bar, [mode]: next };
    onChange({ ...v, bar });
  };
  const toggleModal = (key: OrderPageModalSection) => {
    const next = v.modal.includes(key) ? v.modal.filter((k) => k !== key) : [...v.modal, key];
    onChange({ ...v, modal: next });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata bar */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">
            Barre d&apos;infos{single ? '' : ' · par mode'}
          </h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            Choisissez ce qui s&apos;affiche sous le titre. Un élément n&apos;apparaît que si la donnée existe.
          </p>
        </div>
        {single ? (
          locked && (
            <p className="text-[11px] text-fg-secondary bg-[var(--surface-subtle)] rounded-md px-2.5 py-1.5 mb-2 leading-snug">
              Le client choisit le mode au paiement, donc la page affiche une seule barre (mode «&nbsp;{MODE_LABEL[mode]}&nbsp;» par défaut).
            </p>
          )
        ) : (
          <div className="flex gap-1.5 mb-2">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelected(m)}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors ${
                  mode === m
                    ? 'bg-brand-500/10 text-brand-600 ring-1 ring-brand-500'
                    : 'text-fg-secondary hover:bg-[var(--surface-hover)]'
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        <div>
          {BAR_ITEMS[mode].map((item) => (
            <Row
              key={item.key}
              label={item.label}
              on={v.bar[mode].includes(item.key)}
              onToggle={() => toggleBar(item.key)}
            />
          ))}
        </div>
      </section>

      {/* Plus modal */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">Page « Plus »</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            Les sections affichées dans la fenêtre ouverte par le bouton « Plus ».
          </p>
        </div>
        <div>
          {MODAL_SECTIONS.map((s) => (
            <Row
              key={s.key}
              label={s.label}
              on={v.modal.includes(s.key)}
              onToggle={() => toggleModal(s.key)}
            />
          ))}
        </div>
        {v.modal.includes('custom_text') && (
          <textarea
            value={v.modal_text ?? ''}
            onChange={(e) => onChange({ ...v, modal_text: e.target.value })}
            placeholder="Texte personnalisé (ex. livraison le vendredi uniquement…)"
            rows={3}
            className="mt-2 w-full px-2.5 py-2 text-xs rounded-md border border-[var(--divider)] bg-surface focus:border-brand-500 outline-none resize-y"
          />
        )}
      </section>

      <p className="text-[11px] text-fg-secondary leading-snug px-1">
        Le pied de page n&apos;apparaît pas sur la page de commande — ces infos vivent dans la barre et la fenêtre « Plus ».
      </p>
    </div>
  );
}
