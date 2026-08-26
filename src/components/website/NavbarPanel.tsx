'use client';

// NavbarPanel — full customization of the landing-page top navigation.
//
// Extracted verbatim from the legacy website builder (website/page.tsx) so both
// the legacy builder and the v2 builder edit the SAME config.navbar_* fields.
// foodyweb's live navbar (resolveNavbar in SiteNavbar.tsx) reads those legacy
// fields, so edits made here preview live (via foody-draft-state) and render on
// the published site.
//
// All fields live on the config object (persisted via the draft autosave); the
// second-logo/overlay controls only matter for the "overlay" style.

import React, { useState } from 'react';
import { FontSelect } from '@/components/website-menu/FontSelect';
import { curatedFontWeights, WEIGHT_LABELS, loadWebsiteFont } from '@/lib/website-fonts';
import { uploadWebsiteFont, type ExtraFont, type WebsiteConfig } from '@/lib/api';
import { SectionImageUploader } from '@/components/website/SectionEditors';

export function NavbarPanel({ config, onUpdate, restaurantId }: {
  config: WebsiteConfig | null;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  restaurantId: number;
}) {
  const cta = config?.navbar_cta || {};
  const [linkMode, setLinkMode] = useState<'order' | 'catering' | 'custom'>(
    !cta.link || cta.link === 'order' ? 'order' : cta.link === 'catering' ? 'catering' : 'custom',
  );
  if (!config) return <p className="text-xs text-fg-secondary">Chargement…</p>;

  const style = config.navbar_style || 'solid';
  const pos = config.navbar_logo_position || 'left';
  const isOverlay = style === 'overlay';
  const ctaEnabled = cta.enabled !== false;
  const setCta = (patch: Partial<NonNullable<WebsiteConfig['navbar_cta']>>) =>
    onUpdate({ navbar_cta: { ...cta, ...patch } });

  // ── Navbar typography (reuses the FontSelect + extraFonts library) ──────────
  const typo = config.typography ?? {};
  const navExtraFonts = typo.extraFonts ?? [];
  const navFont = config.navbar_font || '';
  const navType = config.navbar_type ?? {};
  const navWeights =
    navFont
      ? curatedFontWeights(navFont) ?? navExtraFonts.find((f) => f.family === navFont)?.weights ?? [400, 700]
      : [400, 700];
  const setNavType = (patch: Partial<NonNullable<WebsiteConfig['navbar_type']>>) =>
    onUpdate({ navbar_type: { ...navType, ...patch } });
  const setNavFont = (family: string, picked?: ExtraFont) => {
    if (family) {
      const src = picked?.faces?.length ? { faces: picked.faces } : picked?.url ? { url: picked.url, format: picked.format } : undefined;
      loadWebsiteFont(family, picked?.weights, src);
    }
    const extraFonts = picked && !navExtraFonts.some((f) => f.family === picked.family) ? [...navExtraFonts, picked] : navExtraFonts;
    onUpdate({ navbar_font: family, typography: { ...typo, extraFonts } });
  };

  const linkStyle = config.navbar_link_style || 'text';

  // ── Composition matrix (content vs shopping × desktop/mobile) ───────────────
  // Effective values default from the legacy navbar_* fields (mirrors foodyweb's
  // resolveNavLayout back-compat) so the UI reflects what actually renders; any
  // edit persists the full explicit nav_layout.
  const navLayout = config.nav_layout ?? null;
  const legacyContentDesktop: 'full' | 'compact' | 'hidden' =
    config.navbar_style === 'hidden' || config.navbar_hamburger === 'always'
      ? 'compact'
      : config.navbar_show_links !== false
        ? 'full'
        : 'compact';
  const eff = {
    content: {
      desktop: navLayout?.content?.desktop ?? legacyContentDesktop,
      mobile: navLayout?.content?.mobile ?? 'compact',
      bottom_bar: navLayout?.content?.bottom_bar ?? false,
    },
    shopping: {
      desktop: navLayout?.shopping?.desktop ?? 'compact',
      mobile: navLayout?.shopping?.mobile ?? 'hidden',
      bottom_bar: navLayout?.shopping?.bottom_bar ?? true,
    },
  } as const;
  const setLayout = (grp: 'content' | 'shopping', patch: Partial<{ desktop: string; mobile: string; bottom_bar: boolean }>) =>
    onUpdate({ nav_layout: { ...eff, [grp]: { ...eff[grp], ...patch } } } as Partial<WebsiteConfig>);
  const MODE_OPTS = [['full', 'Complète'], ['slim', 'Fine sans logo'], ['compact', 'Compacte'], ['hidden', 'Masquée']] as const;
  const modeRow = (label: string, value: string, onSet: (v: string) => void) => (
    <div>
      <label className="block text-[11px] text-fg-secondary mb-1">{label}</label>
      <div className="flex gap-1.5">
        {MODE_OPTS.map(([v, l]) => (
          <button key={v} onClick={() => onSet(v)}
            className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${value === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const groupBlock = (grp: 'content' | 'shopping', title: string, hint: string) => (
    <div className="rounded-lg border border-divider p-2.5 space-y-2.5">
      <div>
        <div className="text-[11px] font-medium text-fg-primary">{title}</div>
        <div className="text-[10px] text-fg-secondary leading-tight">{hint}</div>
      </div>
      {modeRow('Ordinateur', eff[grp].desktop, (v) => setLayout(grp, { desktop: v }))}
      {modeRow('Mobile', eff[grp].mobile, (v) => setLayout(grp, { mobile: v }))}
      <label className="flex items-center gap-2 text-xs text-fg-primary">
        <input type="checkbox" checked={eff[grp].bottom_bar} onChange={(e) => setLayout(grp, { bottom_bar: e.target.checked })} className="accent-brand-500" />
        Barre du bas sur mobile
      </label>
      {eff[grp].desktop === 'hidden' && (
        <p className="text-[10px] text-amber-600">Aucune barre en haut sur ordinateur pour ce type de page.</p>
      )}
    </div>
  );

  const sec = (title: string, node: React.ReactNode) => (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary">{title}</div>
      {node}
    </div>
  );
  const colorRow = (label: string, value: string | undefined, onChange: (v: string) => void, fallback: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-fg-primary">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-divider cursor-pointer" />
        <button onClick={() => onChange('')} className={`text-[10px] ${value ? 'text-fg-secondary hover:text-fg-primary' : 'text-fg-tertiary'}`}>Auto</button>
      </div>
    </div>
  );

  const styleOpts = [
    { v: 'solid', label: 'Pleine', hint: 'Fond opaque en permanence' },
    { v: 'overlay', label: 'Superposée', hint: 'Transparente sur la bannière, opaque au survol' },
    { v: 'custom', label: 'Couleur', hint: 'Fond de couleur personnalisée' },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] leading-relaxed text-fg-secondary">
        La barre de navigation est <strong>partagée par toutes les pages</strong> du site : accueil, commande, traiteur et pages personnalisées.
      </p>

      {sec('Composition par type de page',
        <div className="space-y-2">
          <p className="text-[10px] text-fg-secondary leading-tight">
            Choisissez l&apos;affichage de la navigation, séparément sur <strong>ordinateur</strong> et <strong>mobile</strong>. Complète = barre avec logo, liens et bouton ; Compacte = menu et bouton flottants, sans barre ni logo ; Masquée = aucune navigation en haut.
          </p>
          {groupBlock('content', 'Pages de contenu', 'Accueil et pages de contenu')}
          {groupBlock('shopping', 'Pages boutique', 'Commande, traiteur, pages boutique')}
        </div>,
      )}

      {sec('Barre du bas (mobile)',
        <div className="space-y-2">
          <p className="text-[10px] text-fg-secondary leading-tight">
            La barre du bas s&apos;affiche sur mobile pour les types de page activés ci-dessus. Onglets&nbsp;: Menu, Traiteur, Stories, Compte.
          </p>
          {config.stories_enabled ? (
            <div>
              <label className="block text-xs text-fg-primary mb-1">Onglet par défaut</label>
              <div className="flex gap-1.5">
                {([['menu', 'Menu'], ['stories', 'Stories']] as const).map(([v, l]) => {
                  const first = (config.nav_order || 'menu').split(',')[0] === v;
                  return (
                    <button key={v} onClick={() => onUpdate({ nav_order: v === 'menu' ? 'menu,stories' : 'stories,menu' })}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${first ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-fg-tertiary">Activez les Stories (page Reels) pour réordonner les onglets.</p>
          )}
        </div>,
      )}

      {sec('Style de la barre',
        <div className="grid grid-cols-2 gap-1.5">
          {styleOpts.map((o) => (
            <button key={o.v} onClick={() => onUpdate({ navbar_style: o.v })}
              className={`text-left px-2.5 py-2 rounded-lg border text-xs transition ${style === o.v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
              <div className="font-medium">{o.label}</div>
              <div className="text-[10px] text-fg-secondary leading-tight mt-0.5">{o.hint}</div>
            </button>
          ))}
        </div>,
      )}

      <>
          {sec('Logo',
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-fg-primary mb-1">Position</label>
                <div className="flex gap-1.5">
                  {(['left', 'center', 'right'] as const).map((v) => (
                    <button key={v} onClick={() => onUpdate({ navbar_logo_position: v })}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${pos === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                      {v === 'left' ? 'Gauche' : v === 'center' ? 'Centre' : 'Droite'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Taille du logo</span><span className="text-fg-secondary">{config.logo_size || 40}px</span>
                </label>
                <input type="range" min={24} max={96} step={2} value={config.logo_size || 40} onChange={(e) => onUpdate({ logo_size: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={!!config.hide_navbar_name} onChange={(e) => onUpdate({ hide_navbar_name: e.target.checked })} className="accent-brand-500" />
                Masquer le nom du restaurant
              </label>
              {isOverlay && (
                <div>
                  <label className="block text-xs text-fg-primary mb-1">Logo pour l&apos;état opaque (au survol)</label>
                  <SectionImageUploader restaurantId={restaurantId} currentUrl={config.navbar_scrolled_logo_url || ''} onUploaded={(url) => onUpdate({ navbar_scrolled_logo_url: url })} onRemove={() => onUpdate({ navbar_scrolled_logo_url: '' })} label="Téléverser un logo" />
                  <p className="text-[10px] text-fg-secondary mt-1">Optionnel. Sur la bannière on affiche le logo principal (souvent clair) ; au survol, ce logo (souvent foncé).</p>
                </div>
              )}
            </div>,
          )}

          {sec('Couleurs',
            <div className="space-y-2">
              {colorRow(isOverlay ? 'Fond au survol' : 'Fond', config.navbar_color, (v) => onUpdate({ navbar_color: v }), '#ffffff')}
              {colorRow(isOverlay ? 'Texte au survol' : 'Texte', config.navbar_text_color, (v) => onUpdate({ navbar_text_color: v }), '#111111')}
              {isOverlay && colorRow('Texte sur la bannière', config.navbar_overlay_text_color, (v) => onUpdate({ navbar_overlay_text_color: v }), '#ffffff')}
            </div>,
          )}

          {sec('Typographie',
            <div className="space-y-3">
              <div className="flex gap-1.5">
                <div className="flex-1 min-w-0">
                  <FontSelect
                    value={navFont}
                    onChange={setNavFont}
                    extraFonts={navExtraFonts}
                    defaultLabel="Police par défaut"
                    onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
                  />
                </div>
                <select
                  value={navType.weight ?? ''}
                  onChange={(e) => setNavType({ weight: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-[104px] shrink-0 px-2 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  style={navType.weight ? { fontWeight: navType.weight } : undefined}
                >
                  <option value="">Auto</option>
                  {navWeights.map((w) => (
                    <option key={w} value={w} style={{ fontWeight: w }}>{WEIGHT_LABELS[w] ?? w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Taille des liens</span><span className="text-fg-secondary">{navType.size || 14}px</span>
                </label>
                <input type="range" min={11} max={22} step={1} value={navType.size || 14} onChange={(e) => setNavType({ size: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Interlettrage</span><span className="text-fg-secondary">{navType.letter_spacing || 0}px</span>
                </label>
                <input type="range" min={0} max={6} step={0.5} value={navType.letter_spacing || 0} onChange={(e) => setNavType({ letter_spacing: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={!!navType.uppercase} onChange={(e) => setNavType({ uppercase: e.target.checked })} className="accent-brand-500" />
                Majuscules
              </label>
            </div>,
          )}

          {sec('Style des liens',
            <div className="grid grid-cols-2 gap-1.5">
              {([['text', 'Texte'], ['underline', 'Souligné'], ['pill', 'Pilule'], ['bordered', 'Encadré']] as const).map(([v, label]) => (
                <button key={v} onClick={() => onUpdate({ navbar_link_style: v })}
                  className={`px-2.5 py-2 rounded-lg border text-xs transition ${linkStyle === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                  {label}
                </button>
              ))}
            </div>,
          )}

          {sec("Bouton d'action",
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={ctaEnabled} onChange={(e) => setCta({ enabled: e.target.checked })} className="accent-brand-500" />
                Afficher le bouton
              </label>
              {ctaEnabled && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Texte</label>
                    <input className="input" value={cta.text || ''} placeholder="Commander" onChange={(e) => setCta({ text: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Lien</label>
                    <select className="input" value={linkMode} onChange={(e) => { const m = e.target.value as 'order' | 'catering' | 'custom'; setLinkMode(m); setCta({ link: m === 'custom' ? '' : m }); }}>
                      <option value="order">Commander</option>
                      <option value="catering">Traiteur</option>
                      <option value="custom">Lien personnalisé…</option>
                    </select>
                    {linkMode === 'custom' && (
                      <input className="input mt-1.5" value={cta.link || ''} placeholder="https://… ou /nom-de-page" onChange={(e) => setCta({ link: e.target.value })} />
                    )}
                  </div>
                  {colorRow('Fond du bouton', cta.bg, (v) => setCta({ bg: v }), '#ea580c')}
                  {colorRow('Texte du bouton', cta.text_color, (v) => setCta({ text_color: v }), '#ffffff')}
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Forme</label>
                    <div className="flex gap-1.5">
                      {([['pill', 'Pilule'], ['rounded', 'Arrondi'], ['square', 'Carré']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ shape: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.shape || 'pill') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Taille</label>
                    <div className="flex gap-1.5">
                      {([['sm', 'S'], ['md', 'M'], ['lg', 'L']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ size: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.size || 'md') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Style</label>
                    <div className="flex gap-1.5">
                      {([['filled', 'Plein'], ['outline', 'Contour'], ['ghost', 'Fantôme']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ variant: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.variant || 'filled') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>,
          )}
      </>
    </div>
  );
}
