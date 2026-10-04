'use client';

import { useId, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

/** Splits a persisted instruction into its editable title and body. */
// Backend stores a single `instruction` string per step, but the UI shows a
// title + description. We split on the first newline: line 1 is the title,
// the remainder is the description. These helpers are the single source of
// truth for that convention, shared by menu-item and prep recipe editors.
export function splitInstruction(src: string): { title: string; description: string } {
  const [first, ...rest] = (src ?? '').split('\n');
  return { title: first ?? '', description: rest.join('\n') };
}
/** Joins the editable title and body using the existing API format. */
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
  /**
   * When true, the section starts collapsed behind its "Instructions" header
   * (used in the menu-item Recette tab). The header stays visible with the
   * step count; clicking it reveals the steps + prep/notes. The prep recipe
   * tab leaves this off.
   */
  collapsible?: boolean;
  readOnly?: boolean;
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
  collapsible = false,
  readOnly = false,
}: Props) {
  const { t } = useI18n();
  const id = useId();
  const [collapsed, setCollapsed] = useState(collapsible);

  const addStep = () => onStepsChange([...steps, { title: '', description: '', duration_mins: 0 }]);
  const updateStep = (idx: number, patch: Partial<StepView>) =>
    onStepsChange(steps.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  const removeStep = (idx: number) => onStepsChange(steps.filter((_, i) => i !== idx));

  const instructionsTitle = (
    <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
      {t('recipeInstructions') || 'Instructions'}
      <span className="text-[var(--fg-muted)] font-normal ms-1.5">
        · {steps.length} {t(steps.length === 1 ? 'step' : 'steps')}
      </span>
    </h4>
  );

  return (
    <div>
      <div className={`flex flex-wrap items-center justify-between gap-[var(--s-3)] ${collapsed ? '' : 'mb-[var(--s-3)]'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex min-h-11 items-center gap-2 min-w-0 text-start"
          >
            {instructionsTitle}
            <ChevronDown
              className={`w-4 h-4 text-[var(--fg-muted)] shrink-0 transition-transform duration-fast ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>
        ) : (
          <div>
            {instructionsTitle}
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('recipeInstructionsSubtitle') || 'Étapes détaillées pour préparer ce plat'}
            </p>
          </div>
        )}
        {!collapsed && !readOnly && (
          <button
            type="button"
            onClick={addStep}
            className="inline-flex min-h-11 items-center gap-2 rounded-r-md px-3 text-sm font-semibold text-[var(--brand-ink)] hover:bg-[var(--brand-soft)]"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addStep') || 'Ajouter une étape'}
          </button>
        )}
      </div>

      {!collapsed && (
      <>
      <div className="flex flex-col gap-[var(--s-3)]">
        {steps.map((step, idx) => (
          <InstructionItem
            key={idx}
            number={idx + 1}
            readOnly={readOnly}
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
          <p className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-8)] text-center rounded-r-md border border-dashed border-[var(--line-strong)]">
            {t('noInstructions') || 'Aucune étape définie.'}
          </p>
        )}
      </div>

      {/* Prep time (+ notes when inline) */}
      <div className={`mt-6 grid grid-cols-1 gap-4 ${showNotes ? 'md:grid-cols-3' : ''}`}>
        <div className="md:col-span-1">
          <label htmlFor={`${id}-prep-time`} className="block text-fs-sm font-medium text-[var(--fg-muted)] mb-2">
            {t('prepTime') || 'Temps de préparation'}
          </label>
          <div className="relative">
            <NumberInput
              id={`${id}-prep-time`}
              disabled={readOnly}
              min={0}
              integer
              value={prepTime}
              onChange={onPrepTimeChange}
              className="w-full ps-4 py-2.5 pe-14 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-r-md text-[var(--fg)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
            />
            <span className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] text-sm pointer-events-none">
              min
            </span>
          </div>
        </div>
        {showNotes && (
          <div className="md:col-span-2">
            <label htmlFor={`${id}-notes`} className="block text-fs-sm font-medium text-[var(--fg-muted)] mb-2">
              {t('recipeNotes') || 'Notes'}
            </label>
            <textarea dir="auto"
              id={`${id}-notes`}
              disabled={readOnly}
              value={notes ?? ''}
              onChange={(e) => onNotesChange?.(e.target.value)}
              rows={2}
              className="w-full px-[var(--s-3)] py-[var(--s-3)] bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-r-md text-[var(--fg)] text-fs-sm focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors resize-none"
            />
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// ─── Numbered instruction item ─────────────────────────────────────

function InstructionItem({
  number,
  readOnly,
  title,
  durationMins,
  description,
  onTitleChange,
  onTimeChange,
  onDescriptionChange,
  onDelete,
}: {
  number: number;
  readOnly: boolean;
  title: string;
  durationMins: number;
  description: string;
  onTitleChange: (v: string) => void;
  onTimeChange: (n: number) => void;
  onDescriptionChange: (v: string) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const stepLabel = t('recipeStepNumber').replace('{n}', String(number));
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--brand-ink)]">{stepLabel}</span>
        {!readOnly && <button type="button" onClick={onDelete} className="grid size-11 place-items-center rounded-r-md text-fg-secondary hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]" aria-label={`${t('delete')} — ${stepLabel}`}><Trash2 size={18} /></button>}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="min-w-0 space-y-2 text-sm" htmlFor={`${id}-title`}><span className="block text-fg-secondary">{t('name')}</span><input dir="auto" id={`${id}-title`} disabled={readOnly} type="text" value={title} onChange={event => onTitleChange(event.target.value)} placeholder={stepLabel} aria-label={stepLabel} className="input w-full min-w-0" /></label>
        <label className="min-w-0 space-y-2 text-sm" htmlFor={`${id}-duration`}><span className="block text-fg-secondary">{t('recipeStepDuration')}</span><NumberInput id={`${id}-duration`} disabled={readOnly} min={0} integer value={durationMins} onChange={onTimeChange} placeholder="0" aria-label={`${t('recipeStepDuration')} — ${stepLabel}`} className="input w-full min-w-0 tabular-nums" /></label>
        <label className="min-w-0 space-y-2 text-sm sm:col-span-2" htmlFor={`${id}-description`}><span className="block text-fg-secondary">{t('description')}</span><textarea dir="auto" id={`${id}-description`} disabled={readOnly} value={description} onChange={event => onDescriptionChange(event.target.value)} placeholder={t('recipeStepInstruction')} rows={3} aria-label={`${t('description')} — ${stepLabel}`} className="input w-full resize-y" /></label>
      </div>
    </div>
  );
}
