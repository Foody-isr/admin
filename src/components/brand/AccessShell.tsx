'use client';

import type { ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n';
import FoodyLogo from './FoodyLogo';

/** Shared access layout, keeping form state and authentication in each route. */
export default function AccessShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  return <div className="access-shell">
    <aside className="access-introduction">
      <FoodyLogo variant="wordmark" width={138} />
      <div className="access-message">
        <FoodyLogo variant="symbol" width={64} decorative />
        <h2>{t('authWorkspaceTitle')}</h2>
        <p>{t('authWorkspaceText')}</p>
      </div>
      <span className="text-sm font-medium">Foody Admin</span>
    </aside>
    <main className="access-main">
      <div className="access-preferences">
        <label className="sr-only" htmlFor="access-locale">{t('language')}</label>
        <select id="access-locale" value={locale} onChange={event => setLocale(event.target.value as typeof locale)} className="h-11 border-0 bg-transparent text-sm rounded-r-md px-2">
          <option value="fr">Français</option><option value="en">English</option><option value="he">עברית</option>
        </select>
        <button onClick={toggleTheme} type="button" aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')} className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--surface-2)]">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>
      <div className="access-content">{children}</div>
    </main>
  </div>;
}
