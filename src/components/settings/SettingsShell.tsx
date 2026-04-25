'use client';

/**
 * Thin content wrapper for the Settings section.
 *
 * The settings sub-navigation now lives in the main app Sidebar (replacing
 * the global nav while on /settings/*). This shell exists only to keep
 * `[restaurantId]/settings/layout.tsx` simple and to give a single place to
 * tweak the page padding/width if we want to later.
 */
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
