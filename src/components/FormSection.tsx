'use client';

export default function FormSection({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-3 ${className}`}
    >
      {title && (
        <h3 className="text-xs text-fg-secondary uppercase tracking-wider font-medium">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
