'use client';

// Website Builder v2 — per-page commerce connection (Réglages).
//
// A page connects to one of the two commerce backends, or none:
//   classic  → the restaurant's cartes/menus (pick which, or all)
//   catering → catering prestations/services (pick which, or all)
//   none     → pure content/marketing page
//
// Stored on WebsitePage.settings (round-tripped through the draft), consumed by
// the foodyweb render to show the matching block filtered to the chosen ids.
// Copy is French pending i18n extraction.

import { useEffect, useState } from 'react';
import { listMenus, listCateringServices, type DraftPagePayload } from '@/lib/api';

type Commerce = 'none' | 'classic' | 'catering';

function deriveCommerce(type: string): Commerce {
  if (type === 'order') return 'classic';
  if (type === 'catering') return 'catering';
  return 'none';
}

export function PageCommerce({
  page,
  rid,
  onSave,
  busy,
}: {
  page: DraftPagePayload;
  rid: number;
  onSave: (settings: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const settings = (page.settings ?? {}) as Record<string, unknown>;
  const commerce = (settings.commerce as Commerce) ?? deriveCommerce(page.type);
  const menuIds = (settings.menu_ids as number[]) ?? [];
  const serviceIds = (settings.service_ids as number[]) ?? [];

  const [menus, setMenus] = useState<{ id: number; name: string }[]>([]);
  const [services, setServices] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    listMenus(rid)
      .then((ms) => setMenus(ms.filter((m) => m.web_enabled).map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => setMenus([]));
    listCateringServices(rid)
      .then((ss) => setServices(ss.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setServices([])); // catering off / no perm → empty list
  }, [rid]);

  function setCommerce(next: Commerce) {
    onSave({ ...settings, commerce: next });
  }
  function toggleId(key: 'menu_ids' | 'service_ids', id: number) {
    const cur = (settings[key] as number[]) ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onSave({ ...settings, [key]: next });
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Contenu commercial</div>
      <Seg
        value={commerce}
        onChange={(v) => setCommerce(v as Commerce)}
        options={[
          ['none', 'Aucun'],
          ['classic', 'Cartes'],
          ['catering', 'Traiteur'],
        ]}
      />

      {commerce === 'classic' && (
        <List title="Cartes affichées" empty="Aucune carte web." hint="Vide = toutes les cartes.">
          {menus.map((m) => (
            <CheckRow
              key={m.id}
              label={m.name}
              checked={menuIds.includes(m.id)}
              disabled={busy}
              onChange={() => toggleId('menu_ids', m.id)}
            />
          ))}
        </List>
      )}

      {commerce === 'catering' && (
        <List title="Prestations affichées" empty="Aucune prestation traiteur." hint="Vide = toutes les prestations.">
          {services.map((s) => (
            <CheckRow
              key={s.id}
              label={s.name}
              checked={serviceIds.includes(s.id)}
              disabled={busy}
              onChange={() => toggleId('service_ids', s.id)}
            />
          ))}
        </List>
      )}

      {commerce === 'none' && (
        <p className="text-[11px] leading-relaxed text-neutral-400">
          Page de contenu — aucun catalogue affiché. Ses cartes/boutons peuvent lier vers une page de commande.
        </p>
      )}
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function List({
  title,
  empty,
  hint,
  children,
}: {
  title: string;
  empty: string;
  hint: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.filter(Boolean).length === 0;
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{title}</div>
      {isEmpty ? <p className="px-1 py-1.5 text-[11px] text-neutral-400">{empty}</p> : <div className="space-y-0.5">{children}</div>}
      <p className="mt-1.5 text-[10px] text-neutral-400">{hint}</p>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-neutral-50">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-3.5 w-3.5 accent-[#e06c5a]" />
      <span className="text-neutral-700">{label}</span>
    </label>
  );
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={'flex-1 py-1.5 ' + (value === v ? 'bg-[#e06c5a] font-semibold text-white' : 'text-neutral-600')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
