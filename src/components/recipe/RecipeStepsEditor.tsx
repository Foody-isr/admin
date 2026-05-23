'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

// Backend stores a single `instruction` string per step, but the UI shows a
// title + description. We split on the first newline: line 1 is the title,
// the remainder is the description. These helpers are the single source of
// truth for that convention, shared by menu-item and prep recipe editors.
export function splitInstruction(src: string): { title: string; description: string } {
  const [first, ...rest] = (src ?? '').split('\n');
  return { title: first ?? '', description: rest.join('\n') };
}
export function joinInstruction(title: string, description: string): string {
  if (!description) return title;
  return `${title}\n${description}`;
}

// StepView is the local edit shape (title/description split out from the stored
// `instruction` string). Persist by joining back via joinInstruction.
export interface StepView {
  title: string;
  description: string;
  duration_mins: number;
}

interface Props {
  /** Ordered steps (controlled). */
  steps: StepView[];
  /** Total prep/cook time in minutes (controlled). */
  prepTime: number;
  /** Chef notes (controlled). Only used when showNotes is true. */
  notes?: string;
  onStepsChange: (steps: StepView[]) => void;
  onPrepTimeChange: (n: number) => void;
  onNotesChange?: (v: string) => void;
  /**
   * Render the inline chef-notes field. Default true (menu-item recipe tab).
   * The prep recipe tab passes false because its notes field lives in the
   * modal rail (single source of truth for PrepItem.notes).
   */
  showNotes?: boolean;
}

/**
 * RecipeStepsEditor renders the cooking-instructions section: an ordered list
 * of numbered steps (title + description + per-step duration), a prep-time
 * field and a chef-notes field. It is fully controlled — the parent owns the
 * data and persistence. Used by both the menu-item recipe tab and the prep
 * recipe tab so the step UI stays identical and DRY.
 */
export default function RecipeStepsEditor({
  steps,
  prepTime,
  notes,
  onStepsChange,
  onPrepTimeChange,
  onNotesChange,
  showNotes = true,
}: Props) {
  const { t } = useI18n();

  const addStep = () => onStepsChange([...steps, { title: '', description: '', duration_mins: 0 }]);
  const updateStep = (idx: number, patch: Partial<StepView>) =>
    onStepsChange(steps.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  const removeStep = (idx: number) => onStepsChange(steps.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-[var(--s-3)]">
        <div>
          <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
            {t('recipeInstructions') || 'Instructions'}
            <span className="text-[var(--fg-muted)] font-normal ms-1.5">
              · {steps.length} {steps.length === 1 ? 'étape' : 'étapes'}
            </span>
          </h4>
          <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
            {t('recipeInstructionsSubtitle') || 'Étapes détaillées pour préparer ce plat'}
          </p>
        </div>
        <button
          type="button"
          onClick={addStep}
          className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('addStep') || 'Ajouter une étape'}
        </button>
      </div>

      <div className="flex flex-col gap-[var(--s-3)]">
        {steps.map((step, idx) => (
          <InstructionItem
            key={idx}
            number={idx + 1}
            title={step.title ?? ''}
            durationMins={step.duration_mins ?? 0}
            description={step.description ?? ''}
            onTitleChange={(v) => updateStep(idx, { title: v })}
            onTimeChange={(n) => updateStep(idx, { duration_mins: n })}
            onDescriptionChange={(v) => updateStep(idx, { description: v })}
            onDelete={() => removeStep(idx)}
          />
        ))}
        {steps.length === 0 && (
          <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border-2 border-dashed border-[var(--line-strong)]">
            {t('noInstructions') || 'Aucune étape définie.'}
          </p>
        )}
      </div>

      {/* Prep time (+ notes when inline) */}
      <div className={`mt-6 grid grid-cols-1 gap-4 ${showNotes ? 'md:grid-cols-3' : ''}`}>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {t('prepTime') || 'Temps de préparation'}
          </label>
          <div className="relative">
            <NumberInput
              min={0}
              integer
              value={prepTime}
              onChange={onPrepTimeChange}
              className="w-full px-4 py-2.5 pr-14 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-600 dark:text-neutral-400 text-sm pointer-events-none">
              min
            </span>
          </div>
        </div>
        {showNotes && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('recipeNotes') || 'Notes'}
            </label>
            <textarea
              value={notes ?? ''}
              onChange={(e) => onNotesChange?.(e.target.value)}
              rows={2}
              className="w-full px-[var(--s-3)] py-[var(--s-3)] bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-r-md text-[var(--fg)] text-fs-sm focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Numbered instruction item ─────────────────────────────────────

function InstructionItem({
  number,
  title,
  durationMins,
  description,
  onTitleChange,
  onTimeChange,
  onDescriptionChange,
  onDelete,
}: {
  number: number;
  title: string;
  durationMins: number;
  description: string;
  onTitleChange: (v: string) => void;
  onTimeChange: (n: number) => void;
  onDescriptionChange: (v: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] shadow-1 p-[var(--s-4)] flex gap-[var(--s-4)]">
      <div
        className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-white font-bold text-fs-sm"
        style={{ background: 'var(--brand-500)' }}
      >
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-2)]">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Étape ${number}`}
            className="flex-1 bg-transparent text-fs-md font-medium text-[var(--fg)] focus:outline-none placeholder:text-[var(--fg-subtle)]"
          />
          <div className="flex items-center gap-1 text-fs-sm text-[var(--fg-muted)] shrink-0">
            <NumberInput
              min={0}
              integer
              value={durationMins}
              onChange={onTimeChange}
              placeholder="0"
              className="w-12 bg-transparent text-right font-mono tabular-nums text-[var(--fg)] focus:outline-none placeholder:text-[var(--fg-subtle)]"
            />
            <span>min</span>
            <button
              type="button"
              onClick={onDelete}
              className="ms-[var(--s-2)] p-1 rounded-r-xs text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
              aria-label="Delete step"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description de l'étape…"
          rows={2}
          className="w-full bg-transparent text-fs-sm text-[var(--fg-muted)] leading-relaxed resize-none focus:outline-none placeholder:text-[var(--fg-subtle)]"
        />
      </div>
    </div>
  );
}
