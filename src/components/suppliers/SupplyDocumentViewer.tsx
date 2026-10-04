'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button, FullScreenEditor } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

/** Accessible image/PDF viewer; unsupported files retain their original open link. */
export default function SupplyDocumentViewer({ doc, onClose }: {
  doc: { url: string; type: string }; onClose: () => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <FullScreenEditor open title={t('scannedDocument')} showCancel={false} onOpenChange={open => { if (!open) onClose(); }}
    footer={<Button asChild variant="secondary" size="lg"><a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink />{t('openDocumentNewTab')}</a></Button>}>
    {failed ? <div role="alert" className="space-y-4 p-4"><p className="text-sm text-[var(--danger-500)]">{t('supplyDocumentFailed')}</p><Button variant="secondary" size="lg" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{t('retry')}</Button></div>
      : doc.type.startsWith('image/') ?
        /* eslint-disable-next-line @next/next/no-img-element */
        <img key={attempt} src={doc.url} alt={t('scannedDocument')} onError={() => setFailed(true)} className="mx-auto max-h-[75vh] max-w-full object-contain" />
        : doc.type === 'application/pdf' ? <iframe src={doc.url} title={t('scannedDocument')} className="h-[70vh] min-h-96 w-full rounded-r-md border border-[var(--line)]" />
          : <p className="py-16 text-center text-sm text-fg-secondary">{t('supplyDocumentExternal')}</p>}
  </FullScreenEditor>;
}
