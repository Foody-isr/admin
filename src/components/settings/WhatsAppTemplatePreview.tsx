'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ds';
import { getMetaWhatsAppTemplateImage, getWhatsAppMediaFile, type MetaWhatsAppTemplate, type WhatsAppAttachment } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { metaTemplateBody, metaTemplateHeader } from '@/lib/whatsapp-meta-templates';

/** Show the actual authenticated image without exposing Meta's expiring URL or credentials. */
export function WhatsAppImagePreview({ rid, templateId, assetId, revision }: { rid: number; templateId?: string; assetId?: string; revision?: unknown }) {
 const { t } = useI18n();
 const [image, setImage] = useState('');
 const [failed, setFailed] = useState(false);
 const [retry, setRetry] = useState(0);
 useEffect(() => {
  let active = true, objectURL = '';
  setImage(''); setFailed(false);
  const request = templateId ? getMetaWhatsAppTemplateImage(rid, templateId) : getWhatsAppMediaFile(rid, assetId ?? '');
  void request.then(blob => {
   if (!blob.type.startsWith('image/')) throw new Error('Invalid image');
   if (active) { objectURL = URL.createObjectURL(blob); setImage(objectURL); }
  }).catch(() => { if (active) setFailed(true); });
  return () => { active = false; if (objectURL) URL.revokeObjectURL(objectURL); };
 }, [rid, templateId, assetId, revision, retry]);
 return <div className="mb-3 overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface)]">
  {image && !failed ? /* eslint-disable-next-line @next/next/no-img-element -- Authenticated, short-lived blob preview. */
   <img src={image} alt={t('waMetaImageAlt')} className="max-h-64 w-full object-contain" onError={() => setFailed(true)} /> :
   <div className="p-4 text-sm leading-6 text-[var(--fg-muted)]" role={failed ? 'alert' : 'status'}>{t(failed ? templateId ? 'waMetaImageFailed' : 'waAttachmentPreviewFailed' : templateId ? 'waMetaImageLoading' : 'loading')}{failed && <Button type="button" variant="ghost" size="sm" onClick={() => setRetry(n => n + 1)}>{t('refresh')}</Button>}</div>}
 </div>;
}

/** Preview the current Meta image above the exact message text, including an optional local file override. */
export function WhatsAppTemplatePreview({ rid, template, attachment, body }: { rid: number; template?: MetaWhatsAppTemplate; attachment?: WhatsAppAttachment; body?: string }) {
 const image = metaTemplateHeader(template) === 'IMAGE';
 const fixed = attachment?.source === 'fixed';
 return <div className="wa-preview" dir={template?.language.startsWith('he') ? 'rtl' : 'ltr'}>
  {image && (fixed ? !!attachment.asset_id : true) && <WhatsAppImagePreview key={`${rid}:${template?.id}:${attachment?.asset_id ?? 'meta'}`} rid={rid} templateId={fixed ? undefined : template?.id} assetId={fixed ? attachment?.asset_id : undefined} revision={template} />}
  <p className="whitespace-pre-wrap break-words">{body ?? metaTemplateBody(template)}</p>
 </div>;
}
