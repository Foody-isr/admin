'use client';

import { useRef, useState } from 'react';
import { uploadGroupImage } from '@/lib/api';
import type { BannerDesign, BannerSticker } from '@/lib/api';

// Curated title fonts (Google Fonts). foodyweb loads the chosen one on demand.
const TITLE_FONTS = ['Poppins', 'Montserrat', 'Playfair Display', 'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Lobster', 'Pacifico', 'Caveat'];

// 9-point position grid → sticker center (xPct, yPct).
const POSITIONS: { label: string; x: number; y: number }[] = [
  { label: '↖', x: 10, y: 15 }, { label: '↑', x: 50, y: 15 }, { label: '↗', x: 90, y: 15 },
  { label: '←', x: 10, y: 50 }, { label: '•', x: 50, y: 50 }, { label: '→', x: 90, y: 50 },
  { label: '↙', x: 10, y: 85 }, { label: '↓', x: 50, y: 85 }, { label: '↘', x: 90, y: 85 },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type Props = {
  restaurantId: number;
  groupId: number;
  design: BannerDesign;
  onChange: (design: BannerDesign) => void;
  onClose: () => void;
};

export function BannerDesignerPanel({ restaurantId, groupId, design, onChange, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const title = design.title ?? {};
  const stickers = design.stickers ?? [];

  const setTitle = (patch: Partial<NonNullable<BannerDesign['title']>>) =>
    onChange({ ...design, title: { ...title, ...patch } });

  const setSticker = (id: string, patch: Partial<BannerSticker>) =>
    onChange({ ...design, stickers: stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const removeSticker = (id: string) =>
    onChange({ ...design, stickers: stickers.filter((s) => s.id !== id) });

  const onPickFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadGroupImage(restaurantId, groupId, file);
      const sticker: BannerSticker = { id: uid(), imageUrl: url, xPct: 50, yPct: 35, widthPct: 22, rotationDeg: 0 };
      onChange({ ...design, stickers: [...stickers, sticker] });
    } catch {
      // ignore — keep the panel open so the user can retry
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-[var(--divider)] bg-surface shadow-xl p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Bannière — design</h3>
        <button type="button" onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-sm" aria-label="Fermer">✕</button>
      </div>

      {/* Background color */}
      <Row label="Fond">
        <ColorField value={design.bgColor || '#FCE9B8'} onChange={(v) => onChange({ ...design, bgColor: v })} />
      </Row>

      {/* Title */}
      <div className="border-t border-[var(--divider)] pt-2 flex flex-col gap-2">
        <span className="text-[11px] font-medium text-fg-primary">Titre</span>
        <input
          type="text"
          value={title.text ?? ''}
          onChange={(e) => setTitle({ text: e.target.value })}
          placeholder="Nom de la catégorie"
          className="px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface outline-none focus:border-brand-500"
        />
        <select
          value={title.font ?? ''}
          onChange={(e) => setTitle({ font: e.target.value })}
          className="px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface outline-none focus:border-brand-500"
        >
          <option value="">Police par défaut</option>
          {TITLE_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <Row label={`Taille ${(title.size ?? 1).toFixed(2)}×`}>
          <input
            type="range" min={0.6} max={2.5} step={0.05}
            value={title.size ?? 1}
            onChange={(e) => setTitle({ size: Number(e.target.value) })}
            className="w-full accent-brand-500"
          />
        </Row>
        <Row label="Couleur">
          <ColorField value={title.color || '#1C1C1E'} onChange={(v) => setTitle({ color: v })} />
        </Row>
        <Row label="Alignement">
          <div className="inline-flex rounded-md border border-[var(--divider)] overflow-hidden">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setTitle({ align: a })}
                className={`px-2 py-1 text-[11px] ${(title.align ?? 'center') === a ? 'bg-brand-500 text-white' : 'text-fg-secondary'}`}
              >
                {a === 'left' ? '⬅' : a === 'right' ? '➡' : '↔'}
              </button>
            ))}
          </div>
        </Row>
      </div>

      {/* Stickers */}
      <div className="border-t border-[var(--divider)] pt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-fg-primary">Stickers</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[11px] px-2 py-1 rounded-md bg-brand-500 text-white disabled:opacity-50"
          >
            {uploading ? '…' : '+ Ajouter'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ''; }}
          />
        </div>

        {stickers.length === 0 && (
          <p className="text-[10.5px] text-fg-secondary leading-snug">Ajoutez une image (logo, badge, sticker) à poser sur la bannière. Glissez-la dans l&apos;aperçu ou utilisez les réglages ci-dessous.</p>
        )}

        {stickers.map((s) => (
          <div key={s.id} className="rounded-lg border border-[var(--divider)] p-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-[var(--surface-subtle)]" />
              <span className="text-[10px] text-fg-secondary flex-1 truncate">{s.xPct}%, {s.yPct}%</span>
              <button type="button" onClick={() => removeSticker(s.id)} className="text-fg-secondary hover:text-red-500 text-xs" aria-label="Supprimer">🗑</button>
            </div>
            {/* Position grid */}
            <div className="grid grid-cols-3 gap-1 w-max">
              {POSITIONS.map((p) => {
                const active = s.xPct === p.x && s.yPct === p.y;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setSticker(s.id, { xPct: p.x, yPct: p.y })}
                    className={`w-6 h-6 text-[11px] rounded border ${active ? 'border-brand-500 bg-brand-500/10' : 'border-[var(--divider)]'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <Row label={`Taille ${s.widthPct}%`}>
              <input type="range" min={5} max={70} step={1} value={s.widthPct} onChange={(e) => setSticker(s.id, { widthPct: Number(e.target.value) })} className="w-full accent-brand-500" />
            </Row>
            <Row label={`Rotation ${s.rotationDeg}°`}>
              <input type="range" min={-180} max={180} step={1} value={s.rotationDeg} onChange={(e) => setSticker(s.id, { rotationDeg: Number(e.target.value) })} className="w-full accent-brand-500" />
            </Row>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-fg-secondary w-24 shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 w-full">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-[var(--divider)] shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md border border-[var(--divider)] bg-surface outline-none focus:border-brand-500 font-mono"
      />
    </div>
  );
}
