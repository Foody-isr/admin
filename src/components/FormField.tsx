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
          className="text-sm text-fg-primary font-medium block mb-2"
        >
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
