'use client';

import { useState } from 'react';
import type { ExtraFont, FontFace } from '@/lib/api';
import {
  detectFontVariant, detectFontVariantFromFile, suggestFamilyName, WEIGHT_LABELS,
} from '@/lib/website-fonts';

// Accepted custom-font file extensions (mirrors the server's fontTypeFromExt).
const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf';
const WEIGHT_CHOICES = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Existing faces of a font, upgrading a legacy single-file entry to one face. */
function facesOf(font: ExtraFont): FontFace[] {
  if (font.faces?.length) return font.faces;
  return font.url ? [{ url: font.url, format: font.format }] : [];
}

type Props = {
  /** Uploads one file, resolving with its stored URL + @font-face format + S3 key. */
  onUpload: (file: File) => Promise<{ url: string; format: string; key: string }>;
  /** Called with the assembled font: a new family, or `existing` with the new
   *  files merged in as extra faces. */
  onDone: (font: ExtraFont) => void;
  onCancel: () => void;
  /** When set, adds variants to this owned family (name locked, faces merged). */
  existing?: ExtraFont;
};

/** Upload form for a custom font: pick one or more files, each becomes a variant
 *  whose weight is auto-detected from the font metadata (editable), all grouped
 *  under one family. Reused by the picker (new font) and the manager (new font
 *  or extra variants of an existing one). */
export function FontUploadPanel({ onUpload, onDone, onCancel, existing }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [variants, setVariants] = useState<{ weight: number; style: 'normal' | 'italic' }[]>([]);
  const [name, setName] = useState(existing?.family ?? '');
  const [hebrew, setHebrew] = useState(existing?.supportsHebrew ?? false);
  // Adding to a font you already own implies you have the right to use it.
  const [licensed, setLicensed] = useState(Boolean(existing));
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function chooseFiles(list: FileList | null) {
    const fs = list ? Array.from(list) : [];
    setError(null);
    setFiles(fs);
    // Immediate filename guess, refined from the real font metadata (OS/2 weight).
    setVariants(fs.map((f) => detectFontVariant(f.name)));
    if (!existing && fs.length > 0 && !name.trim()) setName(suggestFamilyName(fs.map((f) => f.name)));
    void Promise.all(fs.map((f) => detectFontVariantFromFile(f))).then(setVariants);
  }

  function setWeight(i: number, weight: number) {
    setVariants((v) => v.map((x, idx) => (idx === i ? { ...x, weight } : x)));
  }

  const family = (existing?.family ?? name).trim();
  const canSubmit = files.length > 0 && family.length > 0 && licensed && !uploading;

  async function submit() {
    if (!canSubmit) return;
    setUploading(true);
    setError(null);
    setDone(0);
    try {
      const newFaces: FontFace[] = [];
      for (let i = 0; i < files.length; i++) {
        const { url, format, key } = await onUpload(files[i]);
        const v = variants[i] ?? { weight: 400, style: 'normal' as const };
        newFaces.push({ url, key, format, weight: v.weight, style: v.style });
        setDone(i + 1);
      }
      const faces = existing ? [...facesOf(existing), ...newFaces] : newFaces;
      const weights = Array.from(new Set(faces.map((f) => f.weight ?? 400))).sort((a, b) => a - b);
      onDone({
        family,
        category: 'custom',
        weights,
        supportsHebrew: existing ? existing.supportsHebrew || hebrew : hebrew,
        faces,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’import.');
      setUploading(false);
    }
  }

  return (
    <div className="p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-fg-primary">
          {existing ? `Ajouter une variante à ${existing.family}` : 'Importer une police'}
        </span>
        <button type="button" onClick={onCancel} className="text-[11px] text-fg-tertiary hover:text-fg-primary">
          Annuler
        </button>
      </div>

      <label className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-dashed border-divider text-[11px] text-fg-secondary cursor-pointer hover:border-fg-tertiary">
        <input type="file" accept={FONT_ACCEPT} multiple className="hidden" onChange={(e) => chooseFiles(e.target.files)} />
        <span className="truncate">
          {files.length > 0
            ? `${files.length} fichier${files.length > 1 ? 's' : ''} sélectionné${files.length > 1 ? 's' : ''}`
            : 'Choisir un ou plusieurs fichiers (.woff2, .woff, .ttf, .otf)'}
        </span>
      </label>

      {!existing && (
        <>
          <p className="text-[10px] text-fg-tertiary leading-relaxed -mt-0.5">
            Ajoutez chaque variante (Léger, Solide, Gras…) comme fichier séparé — elles
            seront regroupées sous une même police.
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la police"
            className="w-full px-2 py-1.5 rounded-md border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </>
      )}

      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">Poids de chaque fichier</span>
          <span className="text-[9px] text-fg-tertiary leading-relaxed">
            Détecté automatiquement — corrigez si besoin (Typo 8 = Regular, Typo 9 = Light…).
            La liste sert à indiquer le poids de CE fichier, pas à en créer d&apos;autres.
          </span>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-[11px] text-fg-secondary" title={f.name}>
                {f.name}
                {variants[i]?.style === 'italic' && <span className="ml-1 italic text-fg-tertiary">italique</span>}
              </span>
              <select
                value={variants[i]?.weight ?? 400}
                onChange={(e) => setWeight(i, Number(e.target.value))}
                className="w-[104px] shrink-0 px-2 py-1 rounded-md border border-divider bg-[var(--surface)] text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              >
                {WEIGHT_CHOICES.map((w) => (
                  <option key={w} value={w}>{WEIGHT_LABELS[w] ?? w} ({w})</option>
                ))}
              </select>
            </div>
          ))}
          {(() => {
            const used = files.map((_, i) => variants[i]?.weight ?? 400);
            return new Set(used).size < used.length ? (
              <span className="text-[10px] text-amber-600 leading-relaxed mt-0.5">
                Plusieurs fichiers ont le même poids. Si ce sont des variantes différentes
                (ex. Regular et Light), ajustez-les ci-dessus.
              </span>
            ) : null;
          })()}
        </div>
      )}

      {!existing && (
        <>
          <label className="flex items-center gap-2 text-[11px] text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={hebrew} onChange={(e) => setHebrew(e.target.checked)} />
            Cette police contient l&apos;hébreu
          </label>
          <label className="flex items-start gap-2 text-[11px] text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} className="mt-0.5" />
            J&apos;ai le droit d&apos;utiliser cette police sur ce site.
          </label>
        </>
      )}

      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="w-full px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-brand-500 text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploading
          ? `Import… (${done}/${files.length})`
          : existing ? 'Ajouter' : 'Importer et utiliser'}
      </button>
    </div>
  );
}
