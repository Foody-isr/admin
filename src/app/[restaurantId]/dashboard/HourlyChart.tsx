'use client';

interface HourlyChartProps {
  data: { hour: number; current: number; previous: number }[];
  height?: number;
  labelCurrent?: string;
  labelPrevious?: string;
}

const HOUR_LABELS = [
  '12am', '', '', '3am', '', '', '6am', '', '', '9', '', '',
  '12pm', '', '', '3pm', '', '', '6pm', '', '', '9pm', '', '',
];

export default function HourlyChart({
  data,
  height = 120,
  labelCurrent,
  labelPrevious,
}: HourlyChartProps) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.current, d.previous)), 1);

  return (
    <div>
      {/* Legend */}
      {(labelCurrent || labelPrevious) && (
        <div className="flex items-center gap-4 mb-3 text-xs text-fg-secondary">
          {labelCurrent && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-brand-500 inline-block" />
              {labelCurrent}
            </span>
          )}
          {labelPrevious && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--divider)' }} />
              {labelPrevious}
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div dir="ltr" className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d) => {
          const curH = (d.current / maxVal) * 100;
          const prevH = (d.previous / maxVal) * 100;
          return (
            <div key={d.hour} className="flex-1 relative flex items-end justify-center gap-[1px]" style={{ height: '100%' }}>
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${prevH}%`,
                  minHeight: d.previous > 0 ? 2 : 0,
                  background: 'var(--divider)',
                }}
              />
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${curH}%`,
                  minHeight: d.current > 0 ? 2 : 0,
                  background: 'var(--sidebar-active)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div dir="ltr" className="flex mt-1.5">
        {data.map((d) => (
          <div key={d.hour} className="flex-1 text-center text-[10px] text-fg-secondary">
            {HOUR_LABELS[d.hour] || ''}
          </div>
        ))}
      </div>
    </div>
  );
}
