'use client';

/**
 * Imprimantes & KDS — settings sub-page.
 * Layout matches design-reference/screens/settings.jsx SettingsPrinters:
 *   - Imprimantes: card per printer with status, jobs as chips, test button
 *   - Écran de cuisine (KDS): list of connected screens with status badge
 *
 * Backend persistence is not yet wired; state lives client-side until the
 * dedicated printer/KDS endpoints land.
 */

import { useState } from 'react';
import {
  ClipboardList,
  Flame,
  MoreHorizontal,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Chip, PageHead, Section } from '@/components/ds';

interface PrinterDraft {
  id: number;
  name: string;
  model: string;
  conn: string;
  status: 'online' | 'offline';
  jobs: string[];
}

interface KdsScreen {
  id: number;
  name: string;
  device: string;
  connected: boolean;
}

const SAMPLE_PRINTERS: PrinterDraft[] = [
  {
    id: 1,
    name: 'Cuisine principale',
    model: 'Epson TM-T88VI',
    conn: '192.168.1.48',
    status: 'online',
    jobs: ['Plats chauds', 'Grill', 'Fritures'],
  },
  {
    id: 2,
    name: 'Salade / Froid',
    model: 'Epson TM-T20III',
    conn: '192.168.1.52',
    status: 'online',
    jobs: ['Entrées froides', 'Salades'],
  },
  {
    id: 3,
    name: 'Bar',
    model: 'Star TSP100',
    conn: '192.168.1.55',
    status: 'offline',
    jobs: ['Boissons', 'Cocktails'],
  },
  {
    id: 4,
    name: 'Ticket client',
    model: 'Epson TM-m30II',
    conn: 'USB',
    status: 'online',
    jobs: ['Factures'],
  },
];

const SAMPLE_KDS: KdsScreen[] = [
  { id: 1, name: 'KDS Cuisine', device: 'iPad Pro 12.9" · Salle', connected: true },
  { id: 2, name: 'KDS Bar', device: 'iPad Air · Bar', connected: true },
];

export default function PrintersSettingsPage() {
  const { t } = useI18n();
  const [printers, setPrinters] = useState<PrinterDraft[]>(SAMPLE_PRINTERS);
  const [kds] = useState<KdsScreen[]>(SAMPLE_KDS);

  const addPrinter = () =>
    setPrinters((p) => [
      ...p,
      {
        id: Date.now(),
        name: t('newPrinter') || 'Nouvelle imprimante',
        model: 'Epson TM-T88VI',
        conn: '192.168.1.0',
        status: 'offline',
        jobs: [],
      },
    ]);

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('printersAndKds') || 'Imprimantes & KDS'}
        desc={t('printersDescNew') || 'Routage des tickets vers les imprimantes et écrans de cuisine.'}
        actions={
          <Button variant="primary" size="md" onClick={addPrinter}>
            <Plus />
            {t('add') || 'Ajouter'}
          </Button>
        }
      />

      <Section title={t('printers') || 'Imprimantes'}>
        <div className="flex flex-col gap-[var(--s-3)]">
          {printers.map((p) => (
            <div
              key={p.id}
              className="p-[var(--s-4)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md"
            >
              <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-3)]">
                <div className="flex items-center gap-[var(--s-3)] min-w-0">
                  <div className="w-10 h-10 rounded-r-sm bg-[var(--surface-2)] grid place-items-center text-[var(--fg-muted)] shrink-0">
                    <ClipboardList className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-fs-sm font-semibold text-[var(--fg)] truncate">
                      {p.name}
                    </div>
                    <div className="text-fs-xs text-[var(--fg-subtle)] font-mono truncate">
                      {p.model} · {p.conn}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-[var(--s-2)] shrink-0">
                  {p.status === 'online' ? (
                    <Badge tone="success" dot>
                      {t('online') || 'En ligne'}
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {t('offline') || 'Hors ligne'}
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm">
                    {t('test') || 'Test'}
                  </Button>
                  <button
                    type="button"
                    className="h-8 w-8 grid place-items-center rounded-r-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
                    aria-label={t('moreActions') || 'Plus'}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {p.jobs.map((j) => (
                  <Chip key={j}>{j}</Chip>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 h-[22px] px-2 rounded-r-sm text-fs-xs text-[var(--fg-muted)] border border-dashed border-[var(--line-strong)] hover:text-[var(--fg)] hover:border-[var(--fg-subtle)]"
                  onClick={() => {
                    const job = window.prompt(t('addJobPrompt') || 'Nom du flux :');
                    if (!job) return;
                    setPrinters((prev) =>
                      prev.map((x) =>
                        x.id === p.id ? { ...x, jobs: [...x.jobs, job] } : x,
                      ),
                    );
                  }}
                >
                  <Plus className="w-2.5 h-2.5" />
                  {t('add') || 'Ajouter'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t('kdsTitle') || 'Écran de cuisine (KDS)'}
        desc={t('kdsScreensDesc') || 'Écrans connectés affichant les commandes en cours.'}
      >
        <div className="flex flex-col gap-[var(--s-2)]">
          {kds.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md"
            >
              <div className="flex items-center gap-[var(--s-3)] min-w-0">
                <Flame className="w-4 h-4 text-[var(--brand-500)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{k.name}</div>
                  <div className="text-fs-xs text-[var(--fg-subtle)] truncate">{k.device}</div>
                </div>
              </div>
              <Badge tone={k.connected ? 'success' : 'neutral'} dot>
                {k.connected ? t('connected') || 'Connecté' : t('disconnected') || 'Déconnecté'}
              </Badge>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
