'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import { Button, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import './team.css';

/** Title and actions measured against Square's team workspaces. */
export function TeamPageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="team-page-header"><h1>{title}</h1><div className="team-page-actions">{children}</div></header>;
}

/** Accessible search with the reference's rounded field and inset icon. */
export function TeamSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="team-search"><Search aria-hidden /><Input type="search" dir="auto" aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} /></div>;
}

/** Full-page team form, keeping explicit saves, focus trapping and return focus. */
export function TeamEditor({ title, description, onClose, actions, busy = false, children }: {
  title: string;
  description?: string;
  onClose: () => void;
  actions?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--surface)]" />
      <Dialog.Content {...focus} dir={direction} {...(!description ? { 'aria-describedby': undefined } : {})} className="team-editor team-surface" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <div className="team-editor-header">
          <Button variant="ghost" icon className="team-secondary" aria-label={t('close')} disabled={busy} onClick={onClose}><X /></Button>
          <div className="team-page-actions">{actions}</div>
        </div>
        <div className="team-editor-scroll"><div className="team-editor-content">
          <Dialog.Title className="team-editor-title">{title}</Dialog.Title>
          {description && <Dialog.Description className="team-editor-description">{description}</Dialog.Description>}
          {children}
        </div></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
