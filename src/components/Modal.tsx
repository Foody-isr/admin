'use client';

export default function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-6 w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary">{title}</h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
