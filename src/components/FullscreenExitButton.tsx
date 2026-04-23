'use client';

import { Minimize2Icon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useFullscreenZoom } from '@/lib/use-fullscreen-zoom';

// Floating exit affordance for fullscreen mode. The Sidebar (which hosts
// the main FullscreenToggle) is hidden while fullscreen is active, so this
// small button ensures the user always has a visible way out besides Esc.
// Renders nothing when not in fullscreen.
export default function FullscreenExitButton() {
  const { t } = useI18n();
  const { isActive, toggle } = useFullscreenZoom();
  if (!isActive) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('exitFullscreen')}
      title={t('exitFullscreen')}
      className="fixed bottom-4 right-4 z-50 p-2.5 rounded-full border shadow-lg transition-colors"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--divider)',
        color: 'var(--text-secondary)',
      }}
    >
      <Minimize2Icon className="w-5 h-5" />
    </button>
  );
}
