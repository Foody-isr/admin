'use client';

import { XIcon } from 'lucide-react';

type ModalSize = 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

export default function Modal({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  size = 'md',
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: ModalSize;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-overlay-in">
      <div
        className={`rounded-modal shadow-2xl ring-1 ring-black/5 w-full ${SIZE_CLASS[size]} flex flex-col max-h-[90vh] animate-modal-in`}
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="flex items-start justify-between gap-3 px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight truncate text-fg-primary">{title}</h3>
              {subtitle && (
                <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors shrink-0"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {footer && (
          <div
            className="px-6 py-4 border-t shrink-0"
            style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
