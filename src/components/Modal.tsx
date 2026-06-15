'use client';

import { XIcon } from 'lucide-react';

export default function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-modal shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--divider)' }}>
          <h3 className="font-semibold text-fg-primary">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
