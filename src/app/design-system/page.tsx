import { notFound } from 'next/navigation';
import { Search, Filter, Plus, Download } from 'lucide-react';
import {
  Badge,
  Button,
  Chip,
  Field,
  Input,
  InputGroup,
  Kbd,
  Kpi,
  NumTd,
  PageHead,
  Section,
  Select,
  Table,
  TableShell,
  Tbody,
  Textarea,
  Thead,
} from '@/components/ds';

export const metadata = { title: 'Design System — Foody Admin' };

const BRAND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const NEUTRALS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'line',
  'line-strong',
  'fg-subtle',
  'fg-muted',
] as const;
const SEMANTIC = ['success', 'warning', 'danger', 'info'] as const;

export default function DesignSystemPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] p-[var(--s-8)]">
      <PageHead
        title={<span className="font-display text-fs-4xl">Foody OS Design System</span>}
        desc="Phase 1 — tokens and base components. Preview dev-only."
        actions={
          <>
            <Button variant="ghost">Dark</Button>
            <Button>Light</Button>
          </>
        }
      />

      <div className="space-y-[var(--s-8)]">
        {/* TOKENS */}
        <Swatches title="Brand ramp">
          {BRAND_STEPS.map((k) => (
            <Swatch key={k} label={String(k)} color={`var(--brand-${k})`} />
          ))}
        </Swatches>

        <Swatches title="Neutrals">
          {NEUTRALS.map((n) => (
            <Swatch key={n} label={n} color={`var(--${n})`} />
          ))}
        </Swatches>

        <Swatches title="Semantic">
          {SEMANTIC.flatMap((s) => [
            <Swatch key={`${s}-500`} label={`${s}-500`} color={`var(--${s}-500)`} />,
            <Swatch key={`${s}-50`} label={`${s}-50`} color={`var(--${s}-50)`} />,
          ])}
        </Swatches>

        {/* BUTTONS */}
        <Section title="Buttons" desc="Variants × sizes. Primary uses --brand-500 only.">
          <div className="flex flex-wrap items-center gap-[var(--s-3)]">
            <Button variant="primary">Enregistrer</Button>
            <Button variant="secondary">Annuler</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Supprimer</Button>
            <Button variant="primary" size="sm">
              <Plus /> Ajouter
            </Button>
            <Button variant="secondary" size="lg">
              <Download /> Exporter
            </Button>
            <Button variant="ghost" size="md" icon aria-label="Filtrer">
              <Filter />
            </Button>
          </div>
        </Section>

        {/* INPUTS */}
        <Section title="Inputs">
          <div className="grid grid-cols-2 gap-[var(--s-4)] max-w-2xl">
            <Field label="Nom" hint="Affiché sur la commande">
              <Input placeholder="Salade César" />
            </Field>
            <Field label="Catégorie">
              <Select defaultValue="salads">
                <option value="salads">Salades</option>
                <option value="drinks">Boissons</option>
                <option value="desserts">Desserts</option>
              </Select>
            </Field>
            <Field label="Recherche" grow>
              <InputGroup
                leading={<Search />}
                trailing={<Kbd>⌘K</Kbd>}
                inputProps={{ placeholder: 'Rechercher un article…' }}
              />
            </Field>
            <Field label="Description">
              <Textarea rows={3} placeholder="Ingrédients, allergènes…" />
            </Field>
          </div>
        </Section>

        {/* BADGES + CHIPS */}
        <Section title="Badges" desc="Semantic status labels.">
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            <Badge tone="neutral" dot>En attente</Badge>
            <Badge tone="success" dot>Payé</Badge>
            <Badge tone="warning" dot>En cuisine</Badge>
            <Badge tone="danger" dot>Annulé</Badge>
            <Badge tone="info" dot>Livraison</Badge>
            <Badge tone="brand">Nouveau</Badge>
          </div>
        </Section>

        <Section title="Chips" desc="Filter pills, aria-pressed for active state.">
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            <Chip active>Tous</Chip>
            <Chip>Entrées</Chip>
            <Chip>Plats</Chip>
            <Chip>Desserts</Chip>
            <Chip>Boissons</Chip>
          </div>
        </Section>

        {/* KPIs */}
        <Section title="KPI cards">
          <div className="grid grid-cols-4 gap-[var(--s-4)]">
            <Kpi label="Revenu brut" value="₪12,480" delta={{ value: '+8.2%', direction: 'up' }} sub="vs. semaine dernière" />
            <Kpi label="Commandes" value="284" delta={{ value: '−3.1%', direction: 'down' }} sub="vs. semaine dernière" />
            <Kpi label="Panier moyen" value="₪44" sub="42 hier" />
            <Kpi label="Stock bas" value="6" sub="articles sous le seuil" />
          </div>
        </Section>

        {/* TABLE */}
        <Section title="Table">
          <TableShell>
            <Table>
              <Thead>
                <tr>
                  <th>Article</th>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Coût</th>
                </tr>
              </Thead>
              <Tbody>
                <tr>
                  <td>Salade César</td>
                  <td><Badge tone="neutral">Salades</Badge></td>
                  <NumTd style={{ textAlign: 'right' }}>42</NumTd>
                  <NumTd style={{ textAlign: 'right' }}>₪18.20</NumTd>
                </tr>
                <tr>
                  <td>Coca Cola</td>
                  <td><Badge tone="neutral">Boissons</Badge></td>
                  <NumTd style={{ textAlign: 'right' }}>3</NumTd>
                  <NumTd style={{ textAlign: 'right' }}>₪4.10</NumTd>
                </tr>
                <tr>
                  <td>Tarte aux pommes</td>
                  <td><Badge tone="neutral">Desserts</Badge></td>
                  <NumTd style={{ textAlign: 'right' }}>12</NumTd>
                  <NumTd style={{ textAlign: 'right' }}>₪9.50</NumTd>
                </tr>
              </Tbody>
            </Table>
          </TableShell>
        </Section>

        {/* TYPE */}
        <Section title="Type scale">
          <div className="space-y-[var(--s-3)]">
            <p className="text-fs-5xl font-display">Instrument Serif 48 · headline</p>
            <p className="text-fs-3xl font-semibold">Geist 28 · page title</p>
            <p className="text-fs-xl">Geist 18 · section title</p>
            <p className="text-fs-md">Geist 14 · body</p>
            <p className="text-fs-sm text-[var(--fg-muted)]">Geist 13 · secondary</p>
            <p className="text-fs-xs text-[var(--fg-subtle)]">Geist 12 · captions</p>
            <p className="font-mono text-fs-sm">Geist Mono 13 · 1234.56 ₪</p>
          </div>
        </Section>

        {/* RADII */}
        <Section title="Radii">
          <div className="flex gap-[var(--s-4)] items-end">
            {[
              ['r-xs', '4'],
              ['r-sm', '6'],
              ['r-md', '10'],
              ['r-lg', '14'],
              ['r-xl', '18'],
            ].map(([key, px]) => (
              <div key={key} className="flex flex-col items-center gap-[var(--s-1)]">
                <div
                  className="w-16 h-16 bg-[var(--surface-2)] border border-[var(--line-strong)]"
                  style={{ borderRadius: `var(--${key})` }}
                />
                <span className="text-fs-micro text-[var(--fg-subtle)]">
                  {key} ({px}px)
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Swatches({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-fs-lg font-semibold mb-[var(--s-3)]">{title}</h2>
      <div className="flex flex-wrap gap-[var(--s-2)]">{children}</div>
    </section>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex-1 min-w-[90px] flex flex-col items-center gap-[var(--s-1)]">
      <div
        className="w-full h-12 rounded-r-md border border-[var(--line)]"
        style={{ background: color }}
      />
      <span className="text-fs-micro text-[var(--fg-subtle)] truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}
