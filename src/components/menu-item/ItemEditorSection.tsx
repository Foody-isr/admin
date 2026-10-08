'use client';

/** A continuous editor section that can retain drafts while its item type is inapplicable. */
export default function ItemEditorSection({
  id,
  title,
  children,
  hidden = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  return (
    <section
      id={`item-${id}`}
      data-item-section={id}
      hidden={hidden}
      aria-labelledby={`item-${id}-title`}
      className="scroll-mt-6 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <h2
        id={`item-${id}-title`}
        tabIndex={-1}
        className="mb-5 text-fs-lg font-semibold text-[var(--fg)] outline-none"
      >
        {title}
      </h2>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}
