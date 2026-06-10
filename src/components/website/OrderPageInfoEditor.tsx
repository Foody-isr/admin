'use client';

import { useState } from 'react';
import type { OrderPageInfo, OrderPageBarItem, OrderPageModalSection } from '@/lib/api';

type Mode = 'pickup' | 'delivery' | 'dine_in';

// Defaults mirror foodyweb (lib/orderPageInfo.ts) so the editor starts from the
// same item set the customer page falls back to when nothing is configured.
const DEFAULT_INFO: OrderPageInfo = {
  bar: {
    pickup: ['batch_week', 'hours', 'min_order', 'fulfilment_time'],
    delivery: ['batch_week', 'hours', 'min_order', 'fulfilment_time'],
    dine_in: ['batch_week', 'hours', 'wifi'],
  },
  modal: ['about', 'hours', 'address', 'contact', 'social'],
  modal_text: '',
};

const MODES: { key: Mode; label: string }[] = [
  { key: 'pickup', label: 'Retrait' },
  { key: 'delivery', label: 'Livraison' },
  { key: 'dine_in', label: 'Sur place' },
];

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
// Only the items that actually render for each mode are offered.
const BAR_ITEMS: Record<Mode, { key: OrderPageBarItem; label: string }[]> = {
  pickup: [
    ...SHARED_BAR,
    { key: 'min_order', label: 'Commande minimum' },
    { key: 'fulfilment_time', label: 'Délai de préparation' },
    ...SOCIAL_BAR,
  ],
  delivery: [
    ...SHARED_BAR,
    { key: 'min_order', label: 'Commande minimum' },
    { key: 'fulfilment_time', label: 'Délai de livraison' },
    ...SOCIAL_BAR,
  ],
  dine_in: [...SHARED_BAR, { key: 'wifi', label: 'WiFi' }, ...SOCIAL_BAR],
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
}: {
  value: OrderPageInfo | null;
  onChange: (v: OrderPageInfo) => void;
}) {
  const [mode, setMode] = useState<Mode>('pickup');
  const v = value ?? DEFAULT_INFO;

  const toggleBar = (key: OrderPageBarItem) => {
    const list = v.bar[mode];
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    onChange({ ...v, bar: { ...v.bar, [mode]: next } });
  };
  const toggleModal = (key: OrderPageModalSection) => {
    const next = v.modal.includes(key) ? v.modal.filter((k) => k !== key) : [...v.modal, key];
    onChange({ ...v, modal: next });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata bar — per mode */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">Barre d&apos;infos · par mode</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            Choisissez ce qui s&apos;affiche sous le titre, pour chaque mode. Un élément n&apos;apparaît que si la donnée existe.
          </p>
        </div>
        <div className="flex gap-1.5 mb-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors ${
                mode === m.key
                  ? 'bg-brand-500/10 text-brand-600 ring-1 ring-brand-500'
                  : 'text-fg-secondary hover:bg-[var(--surface-hover)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
