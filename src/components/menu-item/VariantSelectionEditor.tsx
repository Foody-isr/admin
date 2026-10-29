'use client';

import type { VariantGroupState } from './VariantsEditor';
import { useI18n } from '@/lib/i18n';
import type { ModifierSelectionConfig } from '@/lib/api';

type Props = { group: VariantGroupState; groups: VariantGroupState[]; disabled: boolean; onChange: (patch: Partial<VariantGroupState>) => void };

/** Keeps descriptive variant dimensions and absolute format prices separate. */
export function VariantSelectionEditor({ group, groups, disabled, onChange }: Props) {
  const { t } = useI18n();
  const identity = group.selectionRole === 'identity';
  const config: ModifierSelectionConfig = group.selectionConfig ?? { source: '', source_id: 0, choices: [], presentation: 'auto' };
  const sources = groups.filter(candidate => candidate.key !== group.key && candidate.selectionRole !== 'identity' && candidate.optionSetId && candidate.rows.every(row => row.optionId));
  const source = sources.find(candidate => candidate.optionSetId === config.source_id);
  const choices = source?.rows.filter(row => row.isActive && !row.isComboOnly) ?? [];
  return <fieldset disabled={disabled} className="space-y-4 border-b border-[var(--line)] p-4">
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{t('variantRole')}</span>
      <select className="input" value={identity ? 'identity' : 'price'} onChange={event => onChange({ selectionRole: event.target.value as 'price' | 'identity', selectionConfig: null })}>
        <option value="price">{t('variantPriceRole')}</option><option value="identity">{t('variantIdentityRole')}</option>
      </select>
    </label>
    {identity && <>
      <p className="text-sm text-fg-secondary">{t('variantIdentityHint')}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={config.required !== false}
          onChange={event => onChange({ selectionConfig: { ...config, required: event.target.checked } })}
          className="size-4 accent-[var(--brand-500)]" />
        <span>{t('variantSelectionRequired')}</span>
      </label>
      <p className="text-sm text-fg-secondary">{t('variantSelectionScopeHint')}</p>
      <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => {
        const existing = new Set(group.rows.map(row => row.name));
        onChange({ selectionConfig: { ...config, presentation: 'characters' }, rows: [...group.rows, ...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(name => !existing.has(name)).map(name => ({ key: crypto.randomUUID(), name, price: 0, portion: '', isActive: true, isComboOnly: false }))] });
      }}>{t('variantCharactersFill')}</button>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm"><span>{t('modifierSource')}</span>
          <select className="input" value={config.source ? config.source_id : ''} onChange={event => {
            const selected = sources.find(candidate => candidate.optionSetId === Number(event.target.value));
            onChange({ selectionConfig: { ...config, source: selected ? 'option' : '', source_id: selected?.optionSetId ?? 0, choices: selected?.rows.filter(row => row.isActive && !row.isComboOnly).map(row => ({ id: row.optionId!, count: 0 })) ?? [] } });
          }}>
            <option value="">{t('modifierAlways')}</option>{sources.map(candidate => <option key={candidate.key} value={candidate.optionSetId}>{candidate.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm"><span>{t('modifierPresentation')}</span>
          <select className="input" value={config.presentation} onChange={event => onChange({ selectionConfig: { ...config, presentation: event.target.value as ModifierSelectionConfig['presentation'] } })}>
            <option value="auto">{t('modifierAuto')}</option><option value="list">{t('modifierVisibleList')}</option><option value="characters">{t('modifierCharacters')}</option>
          </select>
        </label>
      </div>
      {!sources.length && <p className="text-sm text-fg-secondary">{t('variantSavedSourceHint')}</p>}
      {source && <><p className="text-sm text-fg-secondary">{t('variantRuleHelp')}</p>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {choices.map(choice => <label key={choice.key} className="flex min-h-14 items-center justify-between gap-4 py-2 text-sm"><span>{choice.name}</span>
            <span className="flex items-center gap-2"><span>{t('modifierPositions')}</span><input className="input w-20" type="number" min={0} max={12} step={1} aria-label={`${choice.name} — ${t('modifierPositions')}`}
              value={config.choices.find(rule => rule.id === choice.optionId)?.count ?? 0}
              onChange={event => onChange({ selectionConfig: { ...config, choices: choices.map(row => ({ id: row.optionId!, count: row.optionId === choice.optionId ? Math.max(0, Math.min(12, Math.floor(Number(event.target.value)))) : config.choices.find(rule => rule.id === row.optionId)?.count ?? 0 })) } })} /></span>
          </label>)}
        </div></>}
    </>}
  </fieldset>;
}
