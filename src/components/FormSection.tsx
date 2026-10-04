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
      className={`rounded-r-lg border border-[var(--divider)] bg-[var(--surface)] p-5 space-y-4 ${className}`}
    >
      {title && <h3 className="font-semibold text-fg-primary">{title}</h3>}
      {children}
    </div>
  );
}
