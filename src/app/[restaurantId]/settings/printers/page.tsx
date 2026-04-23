'use client';

import { useState } from 'react';
import { Badge, Button, Field, Input, PageHead, Section } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { Printer, Plus, Trash2 } from 'lucide-react';

interface PrinterDraft {
  id: number;
  name: string;
  station: 'kitchen' | 'bar' | 'receipt';
  ip: string;
  width: '58mm' | '80mm';
  online: boolean;
}

/**
 * Printers & KDS — scaffolded page matching the reference.
 * Backend endpoints for printer CRUD are not yet wired; this view renders
 * the anatomy and persists form state client-side until the API lands.
 */
export default function PrintersSettingsPage() {
  const { t } = useI18n();
  const [printers, setPrinters] = useState<PrinterDraft[]>([
    { id: 1, name: 'Cuisine principale', station: 'kitchen', ip: '192.168.1.21', width: '80mm', online: true },
    { id: 2, name: 'Bar', station: 'bar', ip: '192.168.1.22', width: '58mm', online: false },
  ]);
  const [kdsEnabled, setKdsEnabled] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);

  const addPrinter = () =>
    setPrinters((p) => [
      ...p,
      {
        id: Date.now(),
        name: t('newPrinter') || 'Nouvelle imprimante',
        station: 'kitchen',
        ip: '',
        width: '80mm',
        online: false,
      },
    ]);
  const removePrinter = (id: number) =>
    setPrinters((p) => p.filter((x) => x.id !== id));
  const updatePrinter = (id: number, patch: Partial<PrinterDraft>) =>
    setPrinters((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="max-w-3xl space-y-[var(--s-5)]">
      <PageHead
        title={t('printersAndKds') || 'Imprimantes & KDS'}
        desc={
          t('printersDesc') ||
          "Tickets cuisine, tickets client, et affichage KDS pour les stations de préparation."
        }
      />

      <Section
        title={t('printers') || 'Imprimantes'}
        desc={t('printersHint') || 'Configurez chaque imprimante réseau et attribuez-la à une station.'}
        aside={
          <Button variant="secondary" size="sm" onClick={addPrinter}>
            <Plus />
            {t('addPrinter') || 'Ajouter'}
          </Button>
        }
      >
        {printers.length === 0 ? (
          <div className="flex flex-col items-center gap-[var(--s-3)] py-[var(--s-8)] text-[var(--fg-muted)]">
            <Printer className="w-10 h-10 text-[var(--fg-subtle)]" />
            <p className="text-fs-sm">{t('noPrinters') || 'Aucune imprimante configurée.'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-3)]">
            {printers.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-[var(--s-3)] items-center p-[var(--s-3)] border border-[var(--line)] rounded-r-md"
              >
                <div
                  className="w-9 h-9 rounded-r-sm grid place-items-center shrink-0"
                  style={{
                    background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                    color: 'var(--brand-500)',
                  }}
                >
                  <Printer className="w-4 h-4" />
                </div>
                <div className="grid grid-cols-2 gap-[var(--s-2)]">
                  <Input
                    value={p.name}
                    onChange={(e) => updatePrinter(p.id, { name: e.target.value })}
                    placeholder={t('name')}
                  />
                  <Input
                    value={p.ip}
                    onChange={(e) => updatePrinter(p.id, { ip: e.target.value })}
                    placeholder="192.168.1.20"
                    className="font-mono"
                  />
                </div>
                <select
                  value={p.station}
                  onChange={(e) => updatePrinter(p.id, { station: e.target.value as PrinterDraft['station'] })}
                  className="h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm"
                >
                  <option value="kitchen">{t('stationKitchen') || 'Cuisine'}</option>
                  <option value="bar">{t('stationBar') || 'Bar'}</option>
                  <option value="receipt">{t('stationReceipt') || 'Client'}</option>
                </select>
                <Badge tone={p.online ? 'success' : 'neutral'} dot>
                  {p.online ? (t('online') || 'En ligne') : (t('offline') || 'Hors ligne')}
                </Badge>
                <button
                  type="button"
                  onClick={() => removePrinter(p.id)}
                  className="p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                  aria-label={t('remove')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('kds') || 'Affichage KDS'} desc={t('kdsDesc') || 'Écrans de cuisine par station.'}>
        <div className="flex flex-col gap-[var(--s-3)]">
          <label className="flex items-start gap-[var(--s-3)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={kdsEnabled}
              onChange={(e) => setKdsEnabled(e.target.checked)}
            />
            <div>
              <div className="text-fs-sm font-medium text-[var(--fg)]">
                {t('kdsEnable') || 'Activer le KDS'}
              </div>
              <div className="text-fs-xs text-[var(--fg-subtle)]">
                {t('kdsEnableDesc') ||
                  "Affiche les commandes en cuisine sur un écran dédié plutôt que sur un ticket papier."}
              </div>
            </div>
          </label>
          <label className="flex items-start gap-[var(--s-3)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
            />
            <div>
              <div className="text-fs-sm font-medium text-[var(--fg)]">
                {t('autoPrint') || 'Impression automatique'}
              </div>
              <div className="text-fs-xs text-[var(--fg-subtle)]">
                {t('autoPrintDesc') || "Imprime le ticket dès que la commande passe en cuisine."}
              </div>
            </div>
          </label>
        </div>
      </Section>

      <div className="text-fs-xs text-[var(--fg-subtle)]">
        {t('printersComingSoon') ||
          'Configuration réseau et persistance serveur à venir dans une prochaine mise à jour.'}
      </div>
    </div>
  );
}
