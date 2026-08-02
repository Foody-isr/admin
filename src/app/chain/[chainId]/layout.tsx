'use client';

import { AuthProvider } from '@/lib/auth-context';

/**
 * Layout for the chain-level ("Global") views. These live outside the
 * [restaurantId] tree because they aggregate across every branch rather than
 * scoping to one restaurant, so they only need auth — not the per-restaurant
 * permission/WS/sidebar providers.
 */
export default function ChainLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
