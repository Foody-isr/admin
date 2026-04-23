import { notFound } from 'next/navigation';

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
      <header className="mb-[var(--s-8)]">
        <h1 className="font-display text-fs-4xl">Foody OS Design System</h1>
        <p className="text-fg-muted text-fs-sm mt-[var(--s-2)]">
          Phase 1 scaffolding — tokens live. Base components arrive in PR 1b.
        </p>
      </header>

      <div className="space-y-[var(--s-8)]">
        <Section title="Brand ramp">
          <div className="flex gap-[var(--s-2)]">
            {BRAND_STEPS.map((k) => (
              <Swatch key={k} label={String(k)} color={`var(--brand-${k})`} />
            ))}
          </div>
        </Section>

        <Section title="Neutrals">
          <div className="grid grid-cols-8 gap-[var(--s-2)]">
            {NEUTRALS.map((n) => (
              <Swatch key={n} label={n} color={`var(--${n})`} />
            ))}
          </div>
        </Section>

        <Section title="Semantic">
          <div className="grid grid-cols-4 gap-[var(--s-3)]">
            {SEMANTIC.map((s) => (
              <div key={s} className="flex flex-col gap-[var(--s-2)]">
                <Swatch label={`${s}-500`} color={`var(--${s}-500)`} />
                <Swatch label={`${s}-50`} color={`var(--${s}-50)`} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="space-y-[var(--s-3)]">
            <p className="text-fs-5xl font-display">Instrument Serif 48 · headline</p>
            <p className="text-fs-3xl font-semibold">Geist 28 · page title</p>
            <p className="text-fs-xl">Geist 18 · section title</p>
            <p className="text-fs-md">Geist 14 · body</p>
            <p className="text-fs-sm text-fg-muted">Geist 13 · secondary</p>
            <p className="text-fs-xs text-fg-subtle">Geist 12 · captions</p>
            <p className="font-mono text-fs-sm">Geist Mono 13 · 1234.56 ₪</p>
          </div>
        </Section>

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
                <span className="text-fs-micro text-fg-subtle">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-fs-lg font-semibold mb-[var(--s-3)]">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-[var(--s-1)]">
      <div
        className="w-full h-12 rounded-r-md border border-[var(--line)]"
        style={{ background: color }}
      />
      <span className="text-fs-micro text-fg-subtle truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}
