'use client';

// Website Builder v2 — Navbar editor (Tout le site → Navigation).
//
// Edits the structured navbar_v2 config (server NavbarConfigV2), desktop and
// mobile authored independently, and saves it into the draft. This is the piece
// that first sets navbar_v2 on a restaurant, which then makes foodyweb render
// the v2 SiteNavbarV2. Copy is French pending i18n extraction.

import { useMemo, useState } from 'react';
import type { DraftResponse, DraftStatePayload } from '@/lib/api';

type Device = 'desktop' | 'mobile';

const DEFAULT_DEVICE = {
  composition: 'logo_left',
  logo: { default_url: '', transparent_url: '', size: 40, overhang: false },
  background: { color: '#ffffff', blur: false, shadow: true, border: false, height: 'medium', corners: 'square' },
  scroll: { transparent_at_top: false, scrolled_color: '#ffffff', hide_on_scroll: false, position: 'sticky' },
  links: { color: '#1a1a1a', hover_color: '#e06c5a', scrolled_color: '#1a1a1a', font: '' },
  actions: [] as Array<{ type: string; label: string; link: string; style: string }>,
};

type DeviceCfg = typeof DEFAULT_DEVICE;
type NavbarCfg = { desktop: DeviceCfg; mobile: DeviceCfg };

function normalizeDevice(v: any): DeviceCfg {
  return {
    ...DEFAULT_DEVICE,
    ...(v || {}),
    logo: { ...DEFAULT_DEVICE.logo, ...(v?.logo || {}) },
    background: { ...DEFAULT_DEVICE.background, ...(v?.background || {}) },
    scroll: { ...DEFAULT_DEVICE.scroll, ...(v?.scroll || {}) },
    links: { ...DEFAULT_DEVICE.links, ...(v?.links || {}) },
    actions: Array.isArray(v?.actions) ? v.actions : [],
  };
}

export function NavbarEditor({
  draft,
  onSave,
  busy,
}: {
  draft: DraftResponse;
  onSave: (next: DraftStatePayload) => void;
  busy: boolean;
}) {
  const cfg = draft.state.config as Record<string, any>;
  const initial = useMemo<NavbarCfg>(
    () => ({
      desktop: normalizeDevice(cfg.navbar_v2?.desktop),
      mobile: normalizeDevice(cfg.navbar_v2?.mobile),
    }),
    [cfg.navbar_v2],
  );

  const [nav, setNav] = useState<NavbarCfg>(initial);
  const [device, setDevice] = useState<Device>('desktop');
  const [dirty, setDirty] = useState(false);
  const d = nav[device];

  function patch(part: Partial<DeviceCfg>) {
    setNav((prev) => ({ ...prev, [device]: { ...prev[device], ...part } }));
    setDirty(true);
  }
  function patchGroup<K extends 'logo' | 'background' | 'scroll' | 'links'>(group: K, part: Partial<DeviceCfg[K]>) {
    setNav((prev) => ({ ...prev, [device]: { ...prev[device], [group]: { ...prev[device][group], ...part } } }));
    setDirty(true);
  }

  function save() {
    onSave({ ...draft.state, config: { ...cfg, navbar_v2: nav } });
    setDirty(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-neutral-900">Navigation</span>
        <span className="text-[10px] text-neutral-400">tout le site</span>
      </div>

      <Seg
        value={device}
        onChange={(v) => setDevice(v as Device)}
        options={[
          ['desktop', '🖥 Desktop'],
          ['mobile', '📱 Mobile'],
        ]}
      />

      <Group title="Disposition">
        <Select
          label="Composition"
          value={d.composition}
          onChange={(v) => patch({ composition: v })}
          options={[
            ['logo_left', 'Logo à gauche'],
            ['logo_center_links_below', 'Logo centré, liens dessous'],
            ['inline_center', 'Tout centré en ligne'],
          ]}
        />
      </Group>

      <Group title="Logo">
        <Text label="Logo par défaut (URL)" value={d.logo.default_url} onChange={(v) => patchGroup('logo', { default_url: v })} />
        <Text label="Logo sur transparent (URL)" value={d.logo.transparent_url} onChange={(v) => patchGroup('logo', { transparent_url: v })} />
        <Num label="Taille (px)" value={d.logo.size} onChange={(v) => patchGroup('logo', { size: v })} />
        <Check label="Déborde sur le contenu" checked={d.logo.overhang} onChange={(v) => patchGroup('logo', { overhang: v })} />
      </Group>

      <Group title="Animation au défilement">
        <Check label="Transparent en haut" checked={d.scroll.transparent_at_top} onChange={(v) => patchGroup('scroll', { transparent_at_top: v })} />
        <Color label="Fond au défilement" value={d.scroll.scrolled_color} onChange={(v) => patchGroup('scroll', { scrolled_color: v })} />
        <Check label="Cacher au défilement" checked={d.scroll.hide_on_scroll} onChange={(v) => patchGroup('scroll', { hide_on_scroll: v })} />
        <Select
          label="Position"
          value={d.scroll.position}
          onChange={(v) => patchGroup('scroll', { position: v })}
          options={[
            ['sticky', 'Collant'],
            ['fixed', 'Fixe'],
            ['static', 'Statique'],
          ]}
        />
      </Group>

      <Group title="Fond & style">
        <Color label="Fond" value={d.background.color} onChange={(v) => patchGroup('background', { color: v })} />
        <Select
          label="Hauteur"
          value={d.background.height}
          onChange={(v) => patchGroup('background', { height: v })}
          options={[
            ['thin', 'Fin'],
            ['medium', 'Moyen'],
            ['tall', 'Grand'],
          ]}
        />
        <Select
          label="Coins"
          value={d.background.corners}
          onChange={(v) => patchGroup('background', { corners: v })}
          options={[
            ['square', 'Carrés'],
            ['rounded', 'Arrondis'],
          ]}
        />
        <Check label="Ombre" checked={d.background.shadow} onChange={(v) => patchGroup('background', { shadow: v })} />
        <Check label="Bordure" checked={d.background.border} onChange={(v) => patchGroup('background', { border: v })} />
        <Check label="Flou" checked={d.background.blur} onChange={(v) => patchGroup('background', { blur: v })} />
      </Group>

      <Group title="Liens">
        <Color label="Couleur" value={d.links.color} onChange={(v) => patchGroup('links', { color: v })} />
        <Color label="Survol" value={d.links.hover_color} onChange={(v) => patchGroup('links', { hover_color: v })} />
        <Color label="Couleur (défilé)" value={d.links.scrolled_color} onChange={(v) => patchGroup('links', { scrolled_color: v })} />
      </Group>

      <Group title="Boutons d'action">
        {d.actions.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={a.type}
              onChange={(e) => {
                const actions = d.actions.slice();
                actions[i] = { ...a, type: e.target.value };
                patch({ actions });
              }}
              className="rounded border border-neutral-300 px-1.5 py-1 text-xs"
            >
              {['order', 'login', 'cart', 'language', 'custom'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              value={a.label}
              placeholder="libellé"
              onChange={(e) => {
                const actions = d.actions.slice();
                actions[i] = { ...a, label: e.target.value };
                patch({ actions });
              }}
              className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
            />
            <button
              onClick={() => patch({ actions: d.actions.filter((_, j) => j !== i) })}
              className="rounded px-1 text-neutral-400 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => patch({ actions: [...d.actions, { type: 'order', label: 'Commander', link: '/order', style: 'primary' }] })}
          className="w-full rounded-md border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:bg-white"
        >
          + Bouton
        </button>
      </Group>

      <button
        onClick={save}
        disabled={busy || !dirty}
        className="w-full rounded-md bg-neutral-900 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        {dirty ? 'Enregistrer la navigation' : 'Enregistré'}
      </button>
    </div>
  );
}

// ── controls ─────────────────────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-2.5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-32 rounded border border-neutral-300 px-1.5 py-1 text-xs" />
    </Row>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs" />
    </Row>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#e06c5a]" />
    </Row>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-6 w-10 cursor-pointer rounded border border-neutral-300" />
    </Row>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Row label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-neutral-300 px-1.5 py-1 text-xs">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Row>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
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
