'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { DetailSkeleton } from './primitives/DetailSkeleton';
import styles from './order-detail.module.css';

export interface OrderDetailShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  head: ReactNode;
  title: string;
  summary?: ReactNode;
  center: ReactNode;
  context: ReactNode;
  payment?: ReactNode;
  notesDock?: ReactNode;
  activity?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** Order detail drawer with fixed actions and one scrolling document. */
export function OrderDetailShell({
  open, onOpenChange, head, title, summary, center, context, payment,
  notesDock, activity, loading, className,
}: OrderDetailShellProps) {
  const focus = useDialogReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content {...focus} aria-describedby={undefined}
          className={cn('order-detail-surface', styles.drawer, className)}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className={styles.toolbar}>{head}</div>
          {loading ? <DetailSkeleton /> : (
            <div className={styles.document} data-order-detail-scroll>
              {summary}
              <section className={styles.details}>{context}</section>
              <section className={styles.items}>{center}</section>
              {payment}
              {notesDock && <section className={styles.notes}>{notesDock}</section>}
              {activity && <section className={styles.activity}>{activity}</section>}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
