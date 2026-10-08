'use client';

/** A continuous editor section that can retain drafts while its item type is inapplicable. */
export default function ItemEditorSection({
  id,
  title,
  children,
  hidden = false,
  hideTitle = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
  hideTitle?: boolean;
}) {
  return (
    <section
      id={`item-${id}`}
      data-item-section={id}
      hidden={hidden}
      aria-labelledby={`item-${id}-title`}
      className="item-editor-section scroll-mt-6"
    >
      <h2
        id={`item-${id}-title`}
        tabIndex={-1}
        className={
          hideTitle ? 'sr-only' : 'item-editor-section-title outline-none'
        }
      >
        {title}
      </h2>
      <div className="item-editor-section-body min-w-0">{children}</div>
    </section>
  );
}
