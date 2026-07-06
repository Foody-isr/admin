'use client';

import { useEffect, useState } from 'react';
import type { ExtraFont } from '@/lib/api';
import { loadCustomFont, WEIGHT_LABELS } from '@/lib/website-fonts';
import { FontUploadPanel } from './FontUploadPanel';

type Props = {
  /** Uploaded (custom) fonts only — Google picks don't need managing. */
  fonts: ExtraFont[];
  /** How many sections (+hero) currently use a font, for delete warnings. */
  usageCount: (family: string) => number;
  onUpload: (file: File) => Promise<{ url: string; format: string; key: string }>;
  /** Import a new font, or add variants to an existing one (merged font). */
  onUpsert: (font: ExtraFont) => void;
  onRename: (oldFamily: string, newFamily: string) => void;
  onDelete: (font: ExtraFont) => void;
  onRemoveVariant: (family: string, faceIndex: number) => void;
};

function variantLabel(weight?: number, style?: 'normal' | 'italic'): string {
  const w = weight ? (WEIGHT_LABELS[weight] ?? String(weight)) : 'Regular';
  return style === 'italic' ? `${w} italique` : w;
}

/** In-context manager for the restaurant's uploaded fonts: import (one or
 *  several files), rename, add/remove variants, and delete (freeing the S3
 *  files). Lives inside the Typography panel — the picker stays for selecting. */
export function MyFontsManager({
  fonts, usageCount, onUpload, onUpsert, onRename, onDelete, onRemoveVariant,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [addVariantFor, setAddVariantFor] = useState<string | null>(null);
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);

  // Render each font name in its own face.
  useEffect(() => {
    for (const f of fonts) loadCustomFont(f.family, { url: f.url, format: f.format, faces: f.faces });
  }, [fonts]);

  function commitRename(font: ExtraFont) {
    const next = renameValue.trim();
    if (next && next !== font.family) onRename(font.family, next);
    setRenamingFor(null);
  }

  const faces = (f: ExtraFont) => f.faces ?? (f.url ? [{ url: f.url, format: f.format }] : []);

  return (
    <div className="border-t border-[var(--divider)] pt-4">
      <label className="block text-xs font-medium text-fg-primary mb-1">Mes polices</label>
      <p className="text-[10px] text-fg-tertiary mb-2 leading-relaxed">
        Vos polices importées. Ajoutez des variantes (Léger, Solide…), renommez ou supprimez.
      </p>

      {fonts.length === 0 && !importOpen && (
        <p className="text-[11px] text-fg-tertiary mb-2">Aucune police importée pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {fonts.map((font) => {
          const used = usageCount(font.family);
          return (
            <div key={font.family} className="rounded-lg border border-[var(--divider)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                {renamingFor === font.family ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(font)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(font);
                      if (e.key === 'Escape') setRenamingFor(null);
                    }}
                    className="flex-1 min-w-0 px-2 py-1 rounded-md border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                  />
                ) : (
                  <span
                    className="text-[13px] text-fg-primary truncate"
                    style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}
                    title={font.family}
                  >
                    {font.family}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setRenamingFor(font.family); setRenameValue(font.family); }}
                    className="text-[11px] text-fg-secondary hover:text-fg-primary px-1.5 py-0.5"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteFor(font.family)}
                    className="text-[11px] text-red-500 hover:text-red-600 px-1.5 py-0.5"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {/* Variant chips */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {faces(font).map((face, i) => (
                  <span
                    key={`${font.family}-${i}`}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-fg-secondary"
                  >
                    {variantLabel(face.weight, face.style)}
                    {faces(font).length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveVariant(font.family, i)}
                        title="Retirer cette variante"
                        className="text-fg-tertiary hover:text-red-500"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setAddVariantFor(addVariantFor === font.family ? null : font.family)}
                  className="text-[10px] text-brand-500 hover:underline px-1"
                >
                  + Variante
                </button>
              </div>

              <div className="mt-1 text-[10px] text-fg-tertiary">
                {used > 0 ? `Utilisée dans ${used} section${used > 1 ? 's' : ''}` : 'Non utilisée'}
              </div>

              {addVariantFor === font.family && (
                <div className="mt-2 rounded-md border border-[var(--divider)]">
                  <FontUploadPanel
                    existing={font}
                    onUpload={onUpload}
                    onDone={(merged) => { onUpsert(merged); setAddVariantFor(null); }}
                    onCancel={() => setAddVariantFor(null)}
                  />
                </div>
              )}

              {confirmDeleteFor === font.family && (
                <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/5 p-2 flex flex-col gap-2">
                  <p className="text-[11px] text-fg-primary">
                    Supprimer « {font.family} » ?
                    {used > 0 && ` Elle est utilisée dans ${used} section${used > 1 ? 's' : ''} qui reviendront à la police du thème.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { onDelete(font); setConfirmDeleteFor(null); }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500 text-white hover:opacity-90"
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteFor(null)}
                      className="px-2.5 py-1 rounded-md text-[11px] text-fg-secondary hover:bg-[var(--surface-2)]"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Import a new font */}
      {importOpen ? (
        <div className="mt-2 rounded-lg border border-[var(--divider)]">
          <FontUploadPanel
            onUpload={onUpload}
            onDone={(font) => { onUpsert(font); setImportOpen(false); }}
            onCancel={() => setImportOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-divider text-[12px] text-brand-500 hover:bg-brand-500/10 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <path d="M6 2.5v7M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Importer une police
        </button>
      )}
    </div>
  );
}
