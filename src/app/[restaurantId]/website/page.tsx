'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getWebsiteConfig, updateWebsiteConfig, getRestaurant, WebsiteConfig, Restaurant } from '@/lib/api';

const FONT_OPTIONS = [
  'Nunito Sans',
  'Inter',
  'Poppins',
  'Rubik',
  'Open Sans',
  'Playfair Display',
];

const HERO_LAYOUTS = [
  { value: 'standard', label: 'Standard', desc: 'Logo + name overlaid on cover image' },
  { value: 'minimal', label: 'Minimal', desc: 'Clean, compact header' },
  { value: 'fullscreen', label: 'Fullscreen', desc: 'Full-height hero image' },
];

export default function WebsitePage() {
  const params = useParams();
  const restaurantId = Number(params.restaurantId);

  const [config, setConfig] = useState<WebsiteConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [primaryColor, setPrimaryColor] = useState('#EB5204');
  const [secondaryColor, setSecondaryColor] = useState('#C94400');
  const [fontFamily, setFontFamily] = useState('Nunito Sans');
  const [heroLayout, setHeroLayout] = useState('standard');
  const [welcomeText, setWelcomeText] = useState('');
  const [tagline, setTagline] = useState('');
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showHours, setShowHours] = useState(true);
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [cfg, rest] = await Promise.all([
          getWebsiteConfig(restaurantId),
          getRestaurant(restaurantId),
        ]);
        setConfig(cfg);
        setRestaurant(rest);

        // Populate form
        setPrimaryColor(cfg.primary_color || '#EB5204');
        setSecondaryColor(cfg.secondary_color || '#C94400');
        setFontFamily(cfg.font_family || 'Nunito Sans');
        setHeroLayout(cfg.hero_layout || 'standard');
        setWelcomeText(cfg.welcome_text || '');
        setTagline(cfg.tagline || '');
        setShowAddress(cfg.show_address ?? true);
        setShowPhone(cfg.show_phone ?? true);
        setShowHours(cfg.show_hours ?? true);
        const social = cfg.social_links || {};
        setInstagram(social.instagram || '');
        setFacebook(social.facebook || '');
        setTiktok(social.tiktok || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load website config');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [restaurantId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const socialLinks: Record<string, string> = {};
      if (instagram) socialLinks.instagram = instagram;
      if (facebook) socialLinks.facebook = facebook;
      if (tiktok) socialLinks.tiktok = tiktok;

      const updated = await updateWebsiteConfig(restaurantId, {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        font_family: fontFamily,
        hero_layout: heroLayout,
        welcome_text: welcomeText,
        tagline: tagline,
        show_address: showAddress,
        show_phone: showPhone,
        show_hours: showHours,
        social_links: socialLinks,
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Website Customizer</h1>
          <p className="text-sm text-gray-500 mt-1">
            Customize how your online ordering page looks to customers
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-8">
          {/* Branding */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Branding</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="input flex-1"
                    placeholder="#EB5204"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secondary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="input flex-1"
                    placeholder="#C94400"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Typography */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Typography</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Font Family
              </label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="input"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Content */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Welcome Text
                </label>
                <textarea
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Welcome to our restaurant!"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="input"
                  placeholder="Fresh food, fast delivery"
                />
              </div>
            </div>
          </section>

          {/* Layout */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Hero Layout</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {HERO_LAYOUTS.map((layout) => (
                <button
                  key={layout.value}
                  onClick={() => setHeroLayout(layout.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    heroLayout === layout.value
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{layout.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{layout.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Visibility */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Visibility</h2>
            <div className="space-y-3">
              {[
                { label: 'Show Address', value: showAddress, setter: setShowAddress },
                { label: 'Show Phone Number', value: showPhone, setter: setShowPhone },
                { label: 'Show Opening Hours', value: showHours, setter: setShowHours },
              ].map((toggle) => (
                <label key={toggle.label} className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">{toggle.label}</span>
                  <button
                    type="button"
                    onClick={() => toggle.setter(!toggle.value)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      toggle.value ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        toggle.value ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
          </section>

          {/* Social Links */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Social Links</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                <input
                  type="url"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="input"
                  placeholder="https://instagram.com/yourrestaurant"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook</label>
                <input
                  type="url"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  className="input"
                  placeholder="https://facebook.com/yourrestaurant"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">TikTok</label>
                <input
                  type="url"
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  className="input"
                  placeholder="https://tiktok.com/@yourrestaurant"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right: Preview */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview</h3>
            <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              {/* Mini hero preview */}
              <div className="relative h-32" style={{ backgroundColor: primaryColor }}>
                {restaurant?.cover_url && (
                  <img
                    src={restaurant.cover_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="flex items-end gap-2">
                    {restaurant?.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt=""
                        className="w-10 h-10 rounded-lg bg-white border border-white object-cover"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {restaurant?.name?.charAt(0) || 'R'}
                      </div>
                    )}
                    <div>
                      <div
                        className="text-white font-bold text-sm"
                        style={{ fontFamily: `"${fontFamily}", sans-serif` }}
                      >
                        {restaurant?.name || 'Restaurant Name'}
                      </div>
                      {(tagline || restaurant?.description) && (
                        <div className="text-white/70 text-xs truncate max-w-[180px]">
                          {tagline || restaurant?.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info bar preview */}
              <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Pickup
                </span>
                {showHours && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[10px] text-gray-500">
                    10:00-22:00
                  </span>
                )}
                {showAddress && restaurant?.address && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[10px] text-gray-500 truncate max-w-[120px]">
                    {restaurant.address}
                  </span>
                )}
                {showPhone && restaurant?.phone && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[10px] text-gray-500">
                    {restaurant.phone}
                  </span>
                )}
              </div>

              {/* Menu preview skeleton */}
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <div className="w-10 h-10 rounded-lg bg-gray-200" />
                    <div className="flex-1">
                      <div className="h-2.5 bg-gray-200 rounded w-3/4 mb-1.5" />
                      <div className="h-2 bg-gray-100 rounded w-1/2" />
                    </div>
                    <div
                      className="text-xs font-bold"
                      style={{ color: primaryColor }}
                    >
                      &#8362;32
                    </div>
                  </div>
                ))}
              </div>

              {/* Floating cart preview */}
              <div className="px-3 pb-3">
                <div
                  className="w-full py-2.5 rounded-lg text-white text-center text-xs font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  View Cart &middot; &#8362;96.00
                </div>
              </div>
            </div>

            {/* Quick link to live site */}
            {restaurant?.slug && (
              <a
                href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/r/${restaurant.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-center text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                View live site &rarr;
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
