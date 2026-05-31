'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Wand2, ImagePlus, RefreshCw, Settings2 } from 'lucide-react';
import Link from 'next/link';
import {
  listMenuImagePrompts,
  generateMenuItemImage,
  editMenuItemImage,
  confirmMenuItemImage,
  type MenuImagePrompt,
  type MenuItem,
} from '@/lib/api';
import { Button, Field, Input, Textarea, Select } from '@/components/ds';

interface Props {
  restaurantId: number;
  itemId: number;
  /** Used to render a live preview of {{vars}} replacement client-side. The
   *  server re-renders authoritatively before calling OpenAI. */
  itemName: string;
  itemDescription?: string;
  categoryName?: string;
  open: boolean;
  onClose: () => void;
  onSaved: (imageUrl: string, item: MenuItem) => void;
}

type Mode = 'text' | 'edit';

// Client-side preview of {{item_name}} / {{item_description}} / {{category}}.
// The server is authoritative — this is purely so the textarea shows what
// the model will see before the user clicks Generate.
function renderPreview(
  template: string,
  vars: { item_name: string; item_description: string; category: string },
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
    if (key in vars) return (vars as Record<string, string>)[key] ?? '';
    return m;
  });
}

export default function AIImageGeneratorModal({
  restaurantId,
  itemId,
  itemName,
  itemDescription = '',
  categoryName = '',
  open,
  onClose,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>('text');
  const [prompts, setPrompts] = useState<MenuImagePrompt[]>([]);
  const [promptId, setPromptId] = useState<number | ''>('');
  const [promptText, setPromptText] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load templates when the modal opens. The list is small (per-restaurant)
  // so we don't bother with caching.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPreviewB64(null);
    setGenerationId(null);
    setLoadingPrompts(true);
    listMenuImagePrompts(restaurantId)
      .then((rows) => {
        setPrompts(rows);
        const def = rows.find((p) => p.is_default) ?? rows[0];
        if (def) {
          setPromptId(def.id);
          setPromptText(
            renderPreview(def.prompt, {
              item_name: itemName,
              item_description: itemDescription,
              category: categoryName,
            }),
          );
        } else {
          setPromptId('');
          setPromptText('');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load prompts'))
      .finally(() => setLoadingPrompts(false));
  }, [open, restaurantId, itemName, itemDescription, categoryName]);

  // When the user picks a different template, re-render the textarea from
  // its body. If they've manually edited, this discards their edits — that
  // matches the intuition of "I changed my mind, give me a fresh start."
  const handlePromptChange = (newId: number | '') => {
    setPromptId(newId);
    if (newId === '') return;
    const p = prompts.find((x) => x.id === newId);
    if (!p) return;
    setPromptText(
      renderPreview(p.prompt, {
        item_name: itemName,
        item_description: itemDescription,
        category: categoryName,
      }),
    );
  };

  const handleGenerate = async () => {
    setError(null);
    setPreviewB64(null);
    setGenerationId(null);
    if (!promptText.trim()) {
      setError('Prompt is required');
      return;
    }
    setGenerating(true);
    try {
      if (mode === 'edit') {
        if (!referenceFile) {
          setError('Please attach a reference image first');
          setGenerating(false);
          return;
        }
        const res = await editMenuItemImage(restaurantId, itemId, referenceFile, {
          prompt_override: promptText,
        });
        setPreviewB64(res.image_b64);
        setGenerationId(res.generation_id);
      } else {
        const res = await generateMenuItemImage(restaurantId, itemId, {
          prompt_override: promptText,
        });
        setPreviewB64(res.image_b64);
        setGenerationId(res.generation_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewB64 || generationId == null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await confirmMenuItemImage(restaurantId, itemId, {
        generation_id: generationId,
        image_b64: previewB64,
      });
      onSaved(res.image_url, res.item);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-[min(720px,95%)] max-h-[92vh] flex flex-col overflow-hidden rounded-xl bg-[var(--bg)] text-[var(--fg)] shadow-3 border border-[var(--line)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface)] border-b border-[var(--line)]">
          <span className="w-9 h-9 rounded-full grid place-items-center text-white bg-[var(--brand-500)] shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-fs-md font-semibold">Generate image with AI</div>
            <div className="text-fs-xs text-[var(--fg-muted)] truncate">
              For: {itemName || 'this item'}
            </div>
          </div>
          <Button type="button" variant="ghost" size="md" icon onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 px-5 pt-4">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`px-3 py-1.5 rounded-md text-fs-sm font-medium transition-colors ${
              mode === 'text'
                ? 'bg-[var(--brand-500)] text-white'
                : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Wand2 className="inline w-3.5 h-3.5 -mt-px mr-1.5" />
            Text → image
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`px-3 py-1.5 rounded-md text-fs-sm font-medium transition-colors ${
              mode === 'edit'
                ? 'bg-[var(--brand-500)] text-white'
                : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            <ImagePlus className="inline w-3.5 h-3.5 -mt-px mr-1.5" />
            Edit photo
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Template picker */}
          <Field
            label="Template"
            hint={
              <Link
                href={`/${restaurantId}/menu/image-prompts`}
                className="text-[var(--brand-500)] hover:underline inline-flex items-center gap-1"
              >
                <Settings2 className="w-3 h-3" />
                Manage templates
              </Link>
            }
          >
            <Select
              value={promptId === '' ? '' : String(promptId)}
              onChange={(e) =>
                handlePromptChange(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={loadingPrompts || generating}
            >
              <option value="">— Ad-hoc prompt —</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? ' (default)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          {/* Reference upload (edit mode only) */}
          {mode === 'edit' && (
            <Field
              label="Reference image"
              hint="JPG/PNG/WEBP, ≤ 8MB. The model uses this as a starting point."
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                disabled={generating}
                className="block w-full text-fs-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:text-[var(--fg)] file:cursor-pointer"
              />
              {referenceFile && (
                <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
                  {referenceFile.name} ({Math.round(referenceFile.size / 1024)} KB)
                </div>
              )}
            </Field>
          )}

          {/* Prompt editor */}
          <Field
            label="Prompt"
            hint="Variables: {{item_name}}, {{item_description}}, {{category}} are replaced server-side."
          >
            <Textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              disabled={generating}
              rows={5}
              placeholder="Describe the image you want…"
            />
          </Field>

          {/* Preview */}
          {previewB64 && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <div className="text-fs-xs font-medium mb-2 text-[var(--fg-muted)]">Preview</div>
              <img
                src={`data:image/png;base64,${previewB64}`}
                alt="Generated preview"
                className="w-full max-h-[420px] object-contain rounded-md bg-black/40"
              />
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-md border border-[var(--danger-500)] bg-[color-mix(in_oklab,var(--danger-500)_8%,transparent)] px-3 py-2 text-fs-sm text-[var(--danger-500)]"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--line)] bg-[var(--surface)]">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving || generating}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {previewB64 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerate}
                  disabled={generating || saving}
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleConfirm}
                  disabled={saving || generating}
                >
                  {saving ? 'Saving…' : 'Use this image'}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={handleGenerate}
                disabled={generating || saving || !promptText.trim() || (mode === 'edit' && !referenceFile)}
              >
                <Sparkles className="w-4 h-4" />
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
