'use client';

import { useState } from 'react';
import type {
  OrderPageInfo,
  OrderPageBarItem,
  OrderPageModalSection,
  OrderPageNavigation,
  OrderPageNavigationStyle,
} from '@/lib/api';

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

const DEFAULT_NAVIGATION: OrderPageNavigation = {
  desktop_style: 'hidden',
  mobile_style: 'hidden',
  featured_page_slug: '',
  featured_label: '',
  featured_description: '',
  discover_enabled: false,
  discover_label: '',
  discover_page_slugs: [],
};

export type OrderPageNavigationPageOption = {
  slug: string;
  label: string;
  type: 'landing' | 'content' | 'order' | 'catering';
  visible?: boolean;
};

function normalizeOrderPageInfo(value: OrderPageInfo | null): OrderPageInfo {
  const bar = value?.bar;
  return {
    bar: {
      pickup: Array.isArray(bar?.pickup) ? bar.pickup : DEFAULT_INFO.bar.pickup,
      delivery: Array.isArray(bar?.delivery) ? bar.delivery : DEFAULT_INFO.bar.delivery,
      dine_in: Array.isArray(bar?.dine_in) ? bar.dine_in : DEFAULT_INFO.bar.dine_in,
    },
    modal: Array.isArray(value?.modal) ? value.modal : DEFAULT_INFO.modal,
    modal_text: typeof value?.modal_text === 'string' ? value.modal_text : '',
    ...(value?.navigation
      ? {
          navigation: {
            ...DEFAULT_NAVIGATION,
            ...value.navigation,
            discover_page_slugs: Array.isArray(value.navigation.discover_page_slugs)
              ? value.navigation.discover_page_slugs
              : [],
          },
        }
      : {}),
  };
}

const NAVIGATION_STYLE_OPTIONS: Array<{
  value: OrderPageNavigationStyle;
  label: string;
}> = [
  { value: 'hidden', label: 'Masquée — rendu actuel' },
  { value: 'inline', label: 'Dans la ligne d’infos' },
  { value: 'buttons', label: 'Boutons séparés' },
  { value: 'banner', label: 'Bandeau promotionnel' },
];

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
  pages = [],
}: {
  value: OrderPageInfo | null;
  onChange: (v: OrderPageInfo) => void;
  /** Order modes the restaurant enables, pickup-first (the menu-page default). */
  availableModes: Mode[];
  /** True when the order type is chosen at checkout (the menu page shows one
   *  fixed default bar, so per-mode tabs don't apply). */
  locked: boolean;
  /** Published/draft pages that may be promoted from the order page. */
  pages?: OrderPageNavigationPageOption[];
}) {
  const modes = availableModes.length ? availableModes : (['pickup'] as Mode[]);
  // One fixed bar when the customer can't switch mode on the page (locked) or
  // only one mode exists — otherwise tabs for each switchable mode.
  const single = locked || modes.length <= 1;
  const [selected, setSelected] = useState<Mode>(modes[0]);
  const mode: Mode = single ? modes[0] : modes.includes(selected) ? selected : modes[0];
  const v = normalizeOrderPageInfo(value);
  const navigation: OrderPageNavigation = {
    ...DEFAULT_NAVIGATION,
    ...v.navigation,
  };
  const destinationPages = pages.filter(
    (page, index) =>
      page.type !== 'order' &&
      page.visible !== false &&
      pages.findIndex((candidate) => candidate.slug === page.slug) === index,
  );
  const navigationEnabled =
    navigation.desktop_style !== 'hidden' ||
    navigation.mobile_style !== 'hidden';

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
  const updateNavigation = (patch: Partial<OrderPageNavigation>) => {
    onChange({
      ...v,
      navigation: { ...navigation, ...patch },
    });
  };
  const updateNavigationStyle = (
    device: 'desktop' | 'mobile',
    style: OrderPageNavigationStyle,
  ) => {
    const key = device === 'desktop' ? 'desktop_style' : 'mobile_style';
    const suggested =
      destinationPages.find((page) => page.type === 'catering') ??
      destinationPages[0];
    updateNavigation({
      [key]: style,
      ...(
        style !== 'hidden' &&
        !navigation.featured_page_slug &&
        suggested
          ? { featured_page_slug: suggested.slug }
          : {}
      ),
    });
  };
  const toggleDiscoverPage = (slug: string) => {
    const selectedSlugs = navigation.discover_page_slugs;
    updateNavigation({
      discover_page_slugs: selectedSlugs.includes(slug)
        ? selectedSlugs.filter((candidate) => candidate !== slug)
        : [...selectedSlugs, slug],
    });
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

      {/* Published-page discovery */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-3">
          <h3 className="text-xs font-semibold mb-0.5">Navigation depuis la commande</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            Mettez une page en avant sans modifier l&apos;adresse habituelle de commande. Chaque appareil peut conserver le rendu actuel.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-fg-primary">Ordinateur</span>
            <select
              value={navigation.desktop_style}
              onChange={(event) => updateNavigationStyle('desktop', event.target.value as OrderPageNavigationStyle)}
              className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
            >
              {NAVIGATION_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-fg-primary">Mobile</span>
            <select
              value={navigation.mobile_style}
              onChange={(event) => updateNavigationStyle('mobile', event.target.value as OrderPageNavigationStyle)}
              className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
            >
              {NAVIGATION_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {destinationPages.length === 0 ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
            Publiez au moins une autre page visible dans la navigation pour l&apos;afficher ici.
          </p>
        ) : navigationEnabled ? (
          <div className="mt-4 space-y-3 border-t border-[var(--divider)] pt-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-fg-primary">Page mise en avant</span>
              <select
                value={navigation.featured_page_slug ?? ''}
                onChange={(event) => updateNavigation({ featured_page_slug: event.target.value })}
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
              >
                <option value="">Aucune page directe</option>
                {destinationPages.map((page) => (
                  <option key={page.slug} value={page.slug}>{page.label}</option>
                ))}
              </select>
            </label>

            {navigation.featured_page_slug ? (
              <div className="grid gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-fg-primary">Libellé personnalisé</span>
                  <input
                    value={navigation.featured_label ?? ''}
                    onChange={(event) => updateNavigation({ featured_label: event.target.value })}
                    placeholder={destinationPages.find((page) => page.slug === navigation.featured_page_slug)?.label ?? 'Titre de la page'}
                    className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-fg-primary">Accroche du bandeau</span>
                  <input
                    value={navigation.featured_description ?? ''}
                    onChange={(event) => updateNavigation({ featured_description: event.target.value })}
                    placeholder="Ex. Vous organisez un événement ?"
                    className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  />
                </label>
              </div>
            ) : null}

            <div className="border-t border-[var(--divider)] pt-2">
              <Row
                label="Afficher le bouton « Découvrir »"
                on={navigation.discover_enabled}
                onToggle={() => updateNavigation({
                  discover_enabled: !navigation.discover_enabled,
                  ...(!navigation.discover_enabled && navigation.discover_page_slugs.length === 0
                    ? { discover_page_slugs: destinationPages.map((page) => page.slug) }
                    : {}),
                })}
              />
            </div>

            {navigation.discover_enabled ? (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-fg-primary">Texte du bouton</span>
                  <input
                    value={navigation.discover_label ?? ''}
                    onChange={(event) => updateNavigation({ discover_label: event.target.value })}
                    placeholder="Découvrir"
                    className="w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  />
                </label>
                <div>
                  <p className="text-[11px] font-medium text-fg-primary">Pages dans la fenêtre</p>
                  <div className="mt-1">
                    {destinationPages.map((page) => (
                      <Row
                        key={page.slug}
                        label={page.label}
                        on={navigation.discover_page_slugs.includes(page.slug)}
                        onToggle={() => toggleDiscoverPage(page.slug)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <p className="rounded-lg bg-[var(--surface-subtle)] px-2.5 py-2 text-[10.5px] leading-snug text-fg-secondary">
              Quand « Découvrir » est visible, il remplace le bouton « Plus » historique sur l&apos;appareil concerné. Le réglage « Plus » reste utile sur les appareils conservant le rendu actuel.
            </p>
          </div>
        ) : null}
      </section>

      {/* Plus modal */}
      <section className="rounded-lg border border-[var(--divider)] p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold mb-0.5">Fenêtre d&apos;informations</h3>
          <p className="text-[11px] text-fg-secondary leading-snug">
            Les sections affichées par « Plus » ou « Découvrir », en dessous des liens de pages.
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
