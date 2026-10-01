"use client";

import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import styles from "./companion.module.css";

/** Focus-managed kitchen detail workspace with a persistent title and optional action bar. */
export function KitchenDrawer({
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const { t, locale } = useI18n();
  const trigger = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.drawer} ${wide ? styles.drawerWide : ""}`}
          dir={locale === "he" ? "rtl" : "ltr"}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          {...(!description ? { "aria-describedby": undefined } : {})}
        >
          <header className={styles.drawerHeader}>
            <div>
              <span className={styles.eyebrow}>{t("companionTitle")}</span>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description>{description}</Dialog.Description>
              )}
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("close")}
              disabled={busy}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.drawerBody}>{children}</div>
          {footer && <footer className={styles.drawerFooter}>{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Search control shared by the bounded kitchen collections. */
export function KitchenSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className={styles.search}>
      <Search size={16} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </label>
  );
}

/** Keeps long operational lists bounded without hiding their total size. */
export function KitchenPagination({
  page,
  count,
  size,
  onChange,
}: {
  page: number;
  count: number;
  size: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <footer className={styles.pagination}>
      <span>
        {count === 0
          ? "0"
          : `${page * size + 1}–${Math.min((page + 1) * size, count)}`}{" "}
        / {count}
      </span>
      <div>
        <button
          aria-label={t("previous")}
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button
          aria-label={t("next")}
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </footer>
  );
}
