'use client';

interface ChartDatum { label: string; current: number; previous: number }
interface HourlyChartProps {
  data: ChartDatum[];
  emptyLabel: string;
  unavailable?: boolean;
  ariaLabel: string;
  formatValue?: (value: number) => string;
}

/** Paired bars retain the time grid in empty states and expose exact values on focus. */
export default function HourlyChart({ data, emptyLabel, unavailable = false, ariaLabel, formatValue = String }: HourlyChartProps) {
  const max = Math.max(1, ...data.flatMap((row) => [Math.abs(row.current), Math.abs(row.previous)]));
  const empty = !data.some((row) => row.current !== 0 || row.previous !== 0);
  const stride = Math.max(1, Math.ceil((data.length - 1) / 8));
  return <div className="dashboard-chart" aria-label={ariaLabel}>
    <div className="dashboard-chart-plot" dir="ltr">
      <div className="dashboard-chart-grid" aria-hidden="true"><i /><i /><i /></div>
      {empty || unavailable ? <div className="dashboard-chart-empty"><span>{emptyLabel}</span></div> : <div className="dashboard-chart-bars">
        {data.map((row, index) => <div className="dashboard-chart-bar" key={index} tabIndex={0} aria-label={`${row.label}: ${formatValue(row.current)} / ${formatValue(row.previous)}`}>
          <div className="dashboard-chart-tooltip">{row.label}<br /><strong>{formatValue(row.current)}</strong> / {formatValue(row.previous)}</div>
          <i className="dashboard-chart-previous" style={{ height: `${Math.abs(row.previous) / max * 100}%` }} />
          <i className="dashboard-chart-current" style={{ height: `${Math.abs(row.current) / max * 100}%` }} />
        </div>)}
      </div>}
    </div>
    <div className="dashboard-chart-axis" dir="ltr">{data.map((row, index) => index % stride === 0 || index === data.length - 1
      ? <span key={index} style={{ left: `${index / Math.max(1, data.length - 1) * 100}%` }}>{row.label}</span> : null)}</div>
  </div>;
}
