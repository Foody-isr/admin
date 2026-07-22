'use client';

/**
 * NavOrderCard — reorder the customer mobile bottom-bar tabs (Menu / Stories)
 * from the website "Général" settings, right beside the landing-page toggle.
 *
 * This card owns its own live WebsiteConfig lifecycle (read + write) on purpose:
 * `nav_order` / `stories_enabled` persist through the live `website-config` PUT,
 * NOT through the website builder's draft/publish flow. Keeping the fetch/save
 * self-contained here means the card never touches the builder's autosave state,
 * and can be dropped into any screen with just a restaurant id.
 *
 * Gating: renders nothing unless Stories are enabled — with a single tab there is
 * nothing to reorder. The Stories toggle itself lives on the Reels page.
 */

import { useCallback, useEffect, useState } from 'react';
import { getWebsiteConfig, updateWebsiteConfig } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';

type NavTab = 'menu' | 'stories';
const NAV_TABS: NavTab[] = ['menu', 'stories'];

/** Normalizes a stored nav_order string into the ordered page-tab keys, filling
 *  in any missing tabs in the default order so none are ever dropped. */
function parseNavOrder(raw?: string): NavTab[] {
  const seen = new Set<NavTab>();
  const out: NavTab[] = [];
  for (const part of (raw || '').split(',').map((s) => s.trim())) {
    if ((NAV_TABS as string[]).includes(part) && !seen.has(part as NavTab)) {
      out.push(part as NavTab);
      seen.add(part as NavTab);
    }
  }
  for (const k of NAV_TABS) if (!seen.has(k)) out.push(k);
  return out;
}

export function NavOrderCard({ rid }: { rid: number }) {
  const { hasAnyPermission } = usePermissions();
  const { t } = useI18n();
  const canEdit = hasAnyPermission('settings.edit');

  const [storiesEnabled, setStoriesEnabled] = useState(false);
  const [navOrder, setNavOrder] = useState<NavTab[]>(['menu', 'stories']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(rid)) return;
    let alive = true;
    getWebsiteConfig(rid)
      .then((cfg) => {
        if (!alive) return;
        setStoriesEnabled(!!cfg.stories_enabled);
        setNavOrder(parseNavOrder(cfg.nav_order));
      })
      .catch(() => {
        /* non-fatal: the card simply stays hidden if config can't load */
      });
    return () => {
      alive = false;
    };
  }, [rid]);

  const moveNav = useCallback(
    async (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= navOrder.length) return;
      const prev = navOrder;
      const next = [...navOrder];
      [next[index], next[target]] = [next[target], next[index]];
      setNavOrder(next); // optimistic
      try {
        await updateWebsiteConfig(rid, { nav_order: next.join(',') });
        setError(null);
      } catch (e: unknown) {
        setNavOrder(prev); // rollback
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [navOrder, rid],
  );

  // With Stories off there is a single tab — nothing to order. The toggle that
  // enables Stories lives on the Reels page.
  if (!storiesEnabled) return null;

  return (
    <div className="rounded-xl border border-divider p-3">
      <div className="text-sm font-medium text-fg-primary">{t('reelsNavTitle')}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-fg-secondary">{t('reelsNavDesc')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {navOrder.map((key, i) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 rounded-lg border border-divider px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-fg-primary">
              <span className="text-fs-sm opacity-50">{i + 1}.</span>
              {key === 'menu' ? t('reelsNavMenu') : t('reelsNavStories')}
              {i === 0 && (
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-fs-xs text-brand-500">
                  {t('reelsNavDefault')}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canEdit || i === 0}
                onClick={() => moveNav(i, -1)}
                aria-label={t('reelsNavUp')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-divider transition-colors disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!canEdit || i === navOrder.length - 1}
                onClick={() => moveNav(i, 1)}
                aria-label={t('reelsNavDown')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-divider transition-colors disabled:opacity-40"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-fs-sm text-[var(--danger-500)]">{error}</p>}
    </div>
  );
}
