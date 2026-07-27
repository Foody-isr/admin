'use client';

import { useMemo, useState } from 'react';

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * Area + line revenue trend over the selected range. Chronological (caller sorts),
 * with an interactive hover crosshair. Forces `dir="ltr"` so the time axis never
 * mirrors under Hebrew RTL.
 */
export default function TrendChart({
  points,
  formatValue,
}: {
  points: TrendPoint[];
  formatValue: (n: number) => string;
}) {
  const W = 720;
  const H = 260;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 34;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    const max = Math.max(1, ...points.map((p) => p.value));
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const xs = points.map((_, i) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW));
    const ys = points.map((p) => padT + innerH - (p.value / max) * innerH);
    const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    const area = xs.length
      ? `${line} L ${xs[xs.length - 1].toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xs[0].toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : '';
    return { xs, ys, line, area, max, innerH };
  }, [points]);

  if (points.length === 0) return null;

  // Thin x-axis labels so they never overlap: show at most ~8.
  const step = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div dir="ltr" className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + geo.innerH * f;
          return <line key={f} x1={0} y1={y} x2={W} y2={y} stroke="var(--line)" strokeDasharray="2 4" />;
        })}
        {geo.area && <path d={geo.area} fill="color-mix(in oklab, var(--brand-500) 16%, transparent)" />}
        {geo.line && <path d={geo.line} fill="none" stroke="var(--brand-500)" strokeWidth={2.5} />}
        {/* Hover crosshair + marker */}
        {hover != null && (
          <>
            <line x1={geo.xs[hover]} y1={padT} x2={geo.xs[hover]} y2={padT + geo.innerH}
              stroke="var(--fg-subtle)" strokeWidth={1} />
            <circle cx={geo.xs[hover]} cy={geo.ys[hover]} r={4.5} fill="var(--brand-500)"
              stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {/* Invisible hit targets */}
        {points.map((p, i) => {
          const bw = W / points.length;
          return (
            <rect key={i} x={geo.xs[i] - bw / 2} y={0} width={bw} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} />
          );
        })}
        {/* X labels */}
        {points.map((p, i) =>
          i % step === 0 ? (
            <text key={`l-${i}`} x={geo.xs[i]} y={H - 12} fontSize={11} fill="var(--fg-muted)"
              textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -top-1 rounded-r-sm bg-[var(--fg)] text-[var(--surface)] text-fs-xs px-2 py-1 whitespace-nowrap shadow-2"
          style={{ left: `${(geo.xs[hover] / W) * 100}%` }}
        >
          <span className="opacity-70">{points[hover].label}</span>{' '}
          <span className="font-semibold tabular-nums">{formatValue(points[hover].value)}</span>
        </div>
      )}
    </div>
  );
}
