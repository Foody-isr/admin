'use client';

export default function FormField({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs text-fg-secondary uppercase tracking-wider font-medium block mb-1"
        >
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
