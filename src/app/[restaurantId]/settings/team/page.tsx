'use client';

/**
 * Équipe & rôles — lives inside the Settings shell (260px nav rail).
 * Tabs between Members (existing /staff content) and Roles (existing /roles
 * content). Consolidates two previously-orphan routes under one shell entry.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  listStaff,
  listRoles,
  StaffMember,
  RestaurantRole,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, PageHead, Section } from '@/components/ds';
import { ExternalLink } from 'lucide-react';

type TeamTab = 'members' | 'roles';

export default function TeamSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [tab, setTab] = useState<TeamTab>('members');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<RestaurantRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listStaff(rid).catch(() => []),
      listRoles(rid).catch(() => []),
    ])
      .then(([s, r]) => {
        setStaff(s);
        setRoles(r);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  return (
    <div className="max-w-3xl space-y-[var(--s-5)]">
      <PageHead
        title={t('staffAndRoles') || 'Équipe & rôles'}
        desc={
          t('staffAndRolesDesc') ||
          "Gérez les membres de l'équipe et les rôles qui contrôlent leurs permissions."
        }
      />

      {/* Tabs — underline pattern */}
      <div className="flex items-center gap-[var(--s-5)] border-b border-[var(--line)]">
        {(
          [
            { key: 'members', label: t('staffMembers') || 'Membres' },
            { key: 'roles', label: t('rolesPermissions') || 'Rôles' },
          ] as const
        ).map((x) => {
          const selected = tab === x.key;
          return (
            <button
              key={x.key}
              type="button"
              aria-selected={selected}
              onClick={() => setTab(x.key)}
              className={`relative py-[var(--s-3)] bg-transparent border-none text-fs-sm font-medium transition-colors ${
                selected
                  ? 'text-[var(--fg)] after:content-[""] after:absolute after:start-0 after:end-0 after:-bottom-px after:h-[2px] after:bg-[var(--brand-500)] after:rounded-[1px]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {x.label}
              <span className="ms-[var(--s-2)] text-fs-xs text-[var(--fg-subtle)] font-mono tabular-nums">
                {x.key === 'members' ? staff.length : roles.length}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
        </div>
      ) : tab === 'members' ? (
        <Section
          title={t('staffMembers') || 'Membres'}
          aside={
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/${rid}/staff`}>
                <ExternalLink />
                {t('manage') || 'Gérer'}
              </Link>
            </Button>
          }
        >
          {staff.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)]">
              {t('noStaffYet') || 'Aucun membre pour le moment.'}
            </p>
          ) : (
            <div className="flex flex-col gap-[var(--s-2)]">
              {staff.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-[var(--s-3)] rounded-r-md bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <div className="text-fs-sm font-medium text-[var(--fg)] truncate">
                      {m.full_name}
                    </div>
                    <div className="text-fs-xs text-[var(--fg-muted)] truncate">{m.email}</div>
                  </div>
                  <Badge tone="neutral">{m.role}</Badge>
                </div>
              ))}
              {staff.length > 5 && (
                <Link
                  href={`/${rid}/staff`}
                  className="text-fs-sm text-[var(--brand-500)] hover:underline self-start mt-[var(--s-2)]"
                >
                  {t('seeAll') || 'Voir tous'} ({staff.length})
                </Link>
              )}
            </div>
          )}
        </Section>
      ) : (
        <Section
          title={t('rolesPermissions') || 'Rôles'}
          aside={
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/${rid}/roles`}>
                <ExternalLink />
                {t('manage') || 'Gérer'}
              </Link>
            </Button>
          }
        >
          {roles.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)]">
              {t('noRolesYet') || 'Aucun rôle personnalisé.'}
            </p>
          ) : (
            <div className="flex flex-col gap-[var(--s-2)]">
              {roles.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-[var(--s-3)] rounded-r-md bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{r.name}</div>
                    {r.description && (
                      <div className="text-fs-xs text-[var(--fg-muted)] truncate">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <Badge tone="neutral">
                    {(r.permissions ?? []).length} {t('permissions') || 'permissions'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
