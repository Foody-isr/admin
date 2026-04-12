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
      {title && <h3 className="font-bold text-fg-primary">{title}</h3>}
      {children}
    </div>
  );
}
