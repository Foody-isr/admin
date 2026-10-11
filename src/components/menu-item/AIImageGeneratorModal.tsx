'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ImagePlus, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import {
  listMenuImagePrompts, generateMenuItemImage, editMenuItemImage, confirmMenuItemImage,
  type MenuImagePrompt, type MenuItem,
} from '@/lib/api';
import { Button, ConfirmDialog, Field, Select, Textarea } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

interface Props {
  restaurantId: number;
  itemId: number;
  itemName: string;
  itemDescription?: string;
  categoryName?: string;
  open: boolean;
  onClose: () => void;
  onSaved: (imageUrl: string, item: MenuItem) => void;
}
type Mode = 'text' | 'edit';

// This is a client preview; the server remains authoritative for substitution.
function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match);
}

/** Generate, review and explicitly save an article image without losing its draft. */
export default function AIImageGeneratorModal(props: Props) {
  return props.open ? <ImageGenerator key={`${props.restaurantId}.${props.itemId}`} {...props}/> : null;
}

function ImageGenerator({ restaurantId, itemId, itemName, itemDescription = '', categoryName = '', onClose, onSaved }: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [mode, setMode] = useState<Mode>('text');
  const [prompts, setPrompts] = useState<MenuImagePrompt[]>([]);
  const [promptId, setPromptId] = useState('');
  const [promptText, setPromptText] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [operation, setOperation] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ image_b64: string; generation_id: number } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const initialPrompt = useRef('');
  const touched = useRef(false);
  const lock = useRef(false);
  const firstInput = useRef<HTMLTextAreaElement>(null);
  const vars = useRef({ item_name: itemName, item_description: itemDescription, category: categoryName });
  const busy = operation !== null;

  useEffect(() => {
    let active = true;
    setLoadingPrompts(true); setLoadError('');
    listMenuImagePrompts(restaurantId).then(rows => {
      if (!active) return;
      setPrompts(rows);
      if (!touched.current) {
        const template = rows.find(row => row.is_default) ?? rows[0];
        const text = template ? renderPreview(template.prompt, vars.current) : '';
        initialPrompt.current = text;
        setPromptId(template ? String(template.id) : ''); setPromptText(text);
      }
    }).catch(cause => {
      if (active) setLoadError(cause instanceof Error ? cause.message : t('loadFailed'));
    }).finally(() => { if (active) setLoadingPrompts(false); });
    return () => { active = false; };
  }, [restaurantId, loadAttempt, t]);

  const close = () => {
    if (lock.current) return;
    if (preview || referenceFile || promptText !== initialPrompt.current) setConfirmClose(true);
    else onClose();
  };
  const chooseTemplate = (id: string) => {
    touched.current = true; setPromptId(id);
    const template = prompts.find(row => String(row.id) === id);
    if (template) setPromptText(renderPreview(template.prompt, vars.current));
  };
  const generate = async () => {
    if (!canEdit || lock.current || !promptText.trim() || (mode === 'edit' && !referenceFile)) return;
    lock.current = true; setOperation('generate'); setError('');
    try {
      const options = { prompt_override: promptText };
      const result = mode === 'edit' && referenceFile
        ? await editMenuItemImage(restaurantId, itemId, referenceFile, options)
        : await generateMenuItemImage(restaurantId, itemId, options);
      setPreview({ image_b64: result.image_b64, generation_id: result.generation_id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('aiImageGenerateFailed')); }
    finally { lock.current = false; setOperation(null); }
  };
  const save = async () => {
    if (!canEdit || lock.current || !preview) return;
    lock.current = true; setOperation('save'); setError('');
    try {
      const result = await confirmMenuItemImage(restaurantId, itemId, preview);
      onSaved(result.image_url, result.item); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { lock.current = false; setOperation(null); }
  };

  return <>
    <Modal title={t('aiImageTitle')} subtitle={<bdi>{itemName}</bdi>} icon={<Sparkles/>} size="3xl"
      initialFocusRef={firstInput} closeDisabled={busy} onClose={close}
      footer={<div className="space-y-3">
        <p className="text-sm text-fg-secondary">{t('aiImageSaveHint')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="lg" variant="secondary" onClick={close} disabled={busy}>{t('cancel')}</Button>
          <Button size="lg" variant={preview ? 'secondary' : 'primary'} onClick={() => void generate()}
            disabled={!canEdit || busy || !promptText.trim() || (mode === 'edit' && !referenceFile)}>
            {preview ? <RefreshCw className="size-4"/> : <Sparkles className="size-4"/>}
            {t(operation === 'generate' ? 'aiImageGenerating' : preview ? 'aiImageRegenerate' : 'aiImageGenerate')}
          </Button>
          {preview && <Button size="lg" onClick={() => void save()} disabled={!canEdit || busy}>{t(operation === 'save' ? 'saving' : 'aiImageUse')}</Button>}
        </div>
      </div>}>
      <div className="space-y-5" aria-busy={busy}>
        <fieldset disabled={busy || !canEdit} className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('aiImageMode')}>
            {([{ value: 'text', label: 'aiImageFromText', Icon: Wand2 }, { value: 'edit', label: 'aiImageEditPhoto', Icon: ImagePlus }] as const).map(({ value, label, Icon }) =>
              <Button size="lg" key={value} variant="secondary" aria-pressed={mode === value} onClick={() => setMode(value)}
                className={mode === value ? 'border-[var(--action)] bg-[var(--brand-soft)] text-[var(--brand-ink)]' : ''}>
                <Icon className="size-4"/>{t(label)}
              </Button>)}
          </div>
          <div className="space-y-2">
            <Field label={t('aiImageTemplate')}><Select className="min-h-11" aria-label={t('aiImageTemplate')}
              value={promptId} onChange={event => chooseTemplate(event.target.value)} disabled={loadingPrompts}>
              <option value="">{t('aiImageCustom')}</option>
              {prompts.map(prompt => <option key={prompt.id} value={prompt.id}>{prompt.name}{prompt.is_default ? ` · ${t('default')}` : ''}</option>)}
            </Select></Field>
            {loadingPrompts && <p role="status" className="text-sm text-fg-secondary">{t('loading')}</p>}
            {loadError && <div className="space-y-2"><p role="alert" className="text-sm text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>{t('retry')}</Button></div>}
            <a href={`/${restaurantId}/menu/image-prompts`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--brand-ink)] underline underline-offset-4">
              {t('aiImageManageTemplates')}<ExternalLink aria-hidden className="size-4"/>
            </a>
          </div>
          {mode === 'edit' && <Field label={t('aiImageReference')} hint={t('aiImageReferenceHint')}>
            <input type="file" aria-label={t('aiImageReference')} accept="image/png,image/jpeg,image/webp"
              className="block min-h-11 w-full min-w-0 text-sm file:me-3 file:min-h-11 file:cursor-pointer file:rounded-r-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:text-[var(--fg)]"
              onChange={event => {
                const file = event.target.files?.[0] ?? null;
                if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
                  event.target.value = ''; setReferenceFile(null); setError(t('aiImageReferenceInvalid')); return;
                }
                setReferenceFile(file); setError('');
              }}/>
          </Field>}
          <Field label={t('imagePromptText')} hint={t('aiImageVariablesHint')}>
            <Textarea dir="auto" ref={firstInput} aria-label={t('imagePromptText')} value={promptText} rows={5} placeholder={t('imagePromptExample')}
              onChange={event => { touched.current = true; setPromptText(event.target.value); }}/>
          </Field>
        </fieldset>
        {operation === 'generate' && <p role="status" className="rounded-r-md bg-[var(--surface-2)] p-3 text-sm">{t('aiImageGeneratingHint')}</p>}
        {preview && <figure className="space-y-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <figcaption className="text-sm text-fg-secondary">{t('aiImagePreviewHint')}</figcaption>
          {/* Generated data URLs must remain local until explicitly confirmed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${preview.image_b64}`} alt={t('aiImagePreviewAlt').replace('{name}', itemName)} className="mx-auto max-h-80 w-full rounded-r-md object-contain"/>
        </figure>}
        {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      </div>
    </Modal>
    <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title={t('aiImageDiscardTitle')}
      description={t('aiImageDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={onClose}/>
  </>;
}
