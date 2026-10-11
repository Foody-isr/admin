'use client';

import { useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useIsMobile } from '@/components/ui/use-mobile';

interface ChartDatum {
  label: string; current: number; previous: number;
  currentPeriodLabel?: string; previousPeriodLabel?: string;
}
interface HourlyChartProps {
  data: ChartDatum[];
  emptyLabel: string;
  unavailable?: boolean;
  ariaLabel: string;
  formatValue?: (value: number) => string;
  showComparison?: boolean;
  metricLabel?: string;
  direction?: 'ltr' | 'rtl';
}

function ChartBar({ row, max, formatValue, showComparison, metricLabel, direction }: {
  row: ChartDatum; max: number; formatValue: (value: number) => string; showComparison: boolean;
  metricLabel: string; direction: 'ltr' | 'rtl';
}) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  return <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
    <TooltipPrimitive.Trigger asChild>
      <button type="button" className="dashboard-chart-bar"
        aria-label={`${row.label}: ${formatValue(row.current)}${showComparison ? ` / ${formatValue(row.previous)}` : ''}`}
        onPointerDown={event => {
          if (event.pointerType === 'touch') { event.preventDefault(); setOpen(value => !value); }
        }}
        onPointerLeave={event => { if (event.pointerType === 'touch') event.preventDefault(); }}
        onClick={event => {
          event.preventDefault();
          if (!('pointerType' in event.nativeEvent) || event.nativeEvent.pointerType !== 'touch') setOpen(value => !value);
        }}>
        {showComparison && <i className="dashboard-chart-previous" style={{ height: `${Math.abs(row.previous) / max * 100}%` }} />}
        <i className="dashboard-chart-current" style={{ height: `${Math.abs(row.current) / max * 100}%` }} />
      </button>
    </TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className="dashboard-chart-tooltip" side={mobile ? 'top' : 'right'} align="center" sideOffset={12} collisionPadding={16} dir={direction}>
        <div className="dashboard-tooltip-period">
          <p>{row.currentPeriodLabel ?? row.label}</p>
          <div><strong>{metricLabel}</strong><span>{formatValue(row.current)}</span></div>
        </div>
        {showComparison && <div className="dashboard-tooltip-period">
          <p>{row.previousPeriodLabel ?? row.label}</p>
          <div><strong>{metricLabel}</strong><span>{formatValue(row.previous)}</span></div>
        </div>}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
}

/** Paired bars retain the time grid in empty states and expose exact values on focus. */
export default function HourlyChart({ data, emptyLabel, unavailable = false, ariaLabel, formatValue = String, showComparison = true,
  metricLabel = ariaLabel, direction = 'ltr' }: HourlyChartProps) {
  const max = Math.max(1, ...data.flatMap((row) => [Math.abs(row.current), showComparison ? Math.abs(row.previous) : 0]));
  const empty = !data.some((row) => row.current !== 0 || (showComparison && row.previous !== 0));
  const stride = Math.max(1, Math.ceil((data.length - 1) / 8));
  return <TooltipPrimitive.Provider delayDuration={0} skipDelayDuration={0}><div className="dashboard-chart" aria-label={ariaLabel}>
    <div className="dashboard-chart-plot" dir="ltr">
      <div className="dashboard-chart-grid" aria-hidden="true"><i /><i /><i /></div>
      {empty || unavailable ? <div className="dashboard-chart-empty"><span>{emptyLabel}</span></div> : <div className="dashboard-chart-bars">
        {data.map((row, index) => <ChartBar key={index} row={row} max={max} formatValue={formatValue}
          showComparison={showComparison} metricLabel={metricLabel} direction={direction} />)}
      </div>}
    </div>
    <div className="dashboard-chart-axis" dir="ltr">{data.map((row, index) => {
      const last = data.length - 1;
      if (index !== last && (index % stride !== 0 || (index !== 0 && last - index < stride / 2))) return null;
      const position = (index + .5) / data.length;
      return <span key={index} style={{ left: `calc(${position * 100}% + ${16 - 32 * position}px)` }}>{row.label}</span>;
    })}</div>
  </div></TooltipPrimitive.Provider>;
}
