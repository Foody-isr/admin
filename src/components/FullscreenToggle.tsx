'use client';

import { useEffect, useRef, useState } from 'react';
import { Minimize2Icon, Maximize2Icon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useFullscreenZoom, ZOOM_LEVELS, type ZoomLevel } from '@/lib/use-fullscreen-zoom';

// Sidebar footer widget: icon button to enter/exit combined fullscreen+zoom
// mode, paired with a compact level picker. Designed to slot in alongside
// the other bottom-row icons (Bell, Calendar, Help, AI).
export default function FullscreenToggle() {
  const { t } = useI18n();
  const { isActive, level, toggle, setLevel } = useFullscreenZoom();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const Icon = isActive ? Minimize2Icon : Maximize2Icon;

  return (
    <div className="relative inline-flex items-center gap-1" ref={menuRef}>
      <button
        onClick={toggle}
        className="p-2 rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        aria-label={isActive ? t('exitFullscreen') : t('fullscreen')}
        title={isActive ? t('exitFullscreen') : t('fullscreen')}
      >
        <Icon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('zoomLevel')}
        className="text-[10px] font-semibold tabular-nums px-1 py-0.5 rounded hover:bg-[var(--sidebar-hover)] transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        {level}%
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30 min-w-[7rem] rounded-lg border shadow-lg py-1"
          style={{ background: 'var(--surface)', borderColor: 'var(--divider)' }}
        >
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-fg-tertiary">
            {t('zoomLevel')}
          </div>
          {ZOOM_LEVELS.map((lvl: ZoomLevel) => {
            const active = lvl === level;
            return (
              <button
                key={lvl}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLevel(lvl);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? 'text-brand-500 font-semibold'
                    : 'text-fg-primary hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-brand-500' : 'bg-transparent'}`} />
                {lvl}%
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
