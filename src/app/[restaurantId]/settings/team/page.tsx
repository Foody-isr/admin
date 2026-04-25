'use client';

/**
 * Équipe & rôles — settings sub-page.
 * Layout matches design-reference/screens/settings.jsx SettingsTeam:
 *   - Header counts active members
 *   - Members table with avatar+online dot, role, status, last activity
 *   - Roles grid (2 columns) of role cards
 *
 * Deep-links to /staff and /roles for full CRUD remain available.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MoreHorizontal, Plus, Edit, Users } from 'lucide-react';
import {
  listStaff,
  listRoles,
  StaffMember,
  RestaurantRole,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, PageHead, Section } from '@/components/ds';

const AVATAR_PALETTE = [
  'var(--cat-1, #f97316)',
  'var(--cat-2, #fbbf24)',
  'var(--cat-3, #4ade80)',
  'var(--cat-4, #60a5fa)',
  'var(--cat-5, #a78bfa)',
  'var(--cat-6, #f472b6)',
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export default function TeamSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<RestaurantRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listStaff(rid).catch(() => []), listRoles(rid).catch(() => [])])
      .then(([s, r]) => {
        setStaff(s);
        setRoles(r);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const activeCount = staff.length;

  return (
    <div className="max-w-[960px]">
      <PageHead
        title={t('staffAndRoles') || 'Équipe & rôles'}
        desc={
          loading
            ? ''
            : `${staff.length} ${t('staffMembersCount') || 'membres'} · ${activeCount} ${
                t('activeMembers') || 'actifs'
              }.`
        }
        actions={
          <>
            <Button variant="secondary" size="md" asChild>
              <Link href={`/${rid}/roles`}>
                <Users />
                {t('manageRoles') || 'Gérer les rôles'}
              </Link>
            </Button>
            <Button variant="primary" size="md" asChild>
              <Link href={`/${rid}/staff`}>
                <Plus />
                {t('inviteMember') || 'Inviter un membre'}
              </Link>
            </Button>
          </>
        }
      />

      <Section title={t('members') || 'Membres'}>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-6 h-6 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
          </div>
        ) : staff.length === 0 ? (
          <p className="text-fs-sm text-[var(--fg-subtle)]">
            {t('noStaffYet') || 'Aucun membre pour le moment.'}
          </p>
        ) : (
          <div className="border border-[var(--line)] rounded-r-md overflow-hidden">
            <div
              className="grid gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] bg-[var(--surface-2)] text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)]"
              style={{ gridTemplateColumns: '1fr 180px 120px 140px 32px' }}
            >
              <span>{t('name') || 'Nom'}</span>
              <span>{t('role') || 'Rôle'}</span>
              <span>{t('status') || 'Statut'}</span>
              <span>{t('lastActivity') || 'Dernière activité'}</span>
              <span />
            </div>
            {staff.map((m, i) => (
              <div
                key={m.id}
                className="grid gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] items-center text-fs-sm border-t border-[var(--line)]"
                style={{ gridTemplateColumns: '1fr 180px 120px 140px 32px' }}
              >
                <div className="flex items-center gap-[var(--s-3)] min-w-0">
                  <div
                    className="relative w-9 h-9 rounded-full grid place-items-center text-white text-fs-xs font-semibold shrink-0"
                    style={{ background: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                  >
                    {initials(m.full_name) || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.full_name}</div>
                    <div className="text-fs-xs text-[var(--fg-subtle)] truncate">{m.email}</div>
                  </div>
                </div>
                <span className="truncate">{m.role_name || m.role}</span>
                <span>
                  <Badge tone="success" dot>
                    {t('active') || 'Actif'}
                  </Badge>
                </span>
                <span className="text-fs-xs text-[var(--fg-subtle)]">—</span>
                <button
                  type="button"
                  className="h-8 w-8 grid place-items-center rounded-r-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
                  aria-label={t('moreActions') || 'Plus'}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t('roles') || 'Rôles'}
        desc={
          t('rolesDesc') ||
          "Définissent les permissions d'accès. Personnalisables dans Gérer les rôles."
        }
      >
        {loading ? null : roles.length === 0 ? (
          <p className="text-fs-sm text-[var(--fg-subtle)]">
            {t('noRolesYet') || 'Aucun rôle personnalisé.'}
          </p>
        ) : (
          <div className="grid gap-[var(--s-3)] grid-cols-1 md:grid-cols-2">
            {roles.map((r) => (
              <div
                key={r.id}
                className="p-[var(--s-4)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md"
              >
                <div className="flex items-center justify-between gap-[var(--s-2)] mb-1.5">
                  <span className="text-fs-sm font-semibold text-[var(--fg)]">{r.name}</span>
                  <Link
                    href={`/${rid}/roles`}
                    className="h-7 w-7 grid place-items-center rounded-r-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
                    aria-label={t('edit') || 'Modifier'}
                  >
                    <Edit className="w-3 h-3" />
                  </Link>
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)] leading-[1.5]">
                  {r.description || `${(r.permissions ?? []).length} permissions`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
