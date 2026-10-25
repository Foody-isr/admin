'use client';

import type { MenuItem, ModifierSelectionConfig, ModifierSet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Props = {
  item: MenuItem;
  set: ModifierSet;
  attachedSets: ModifierSet[];
  value: ModifierSelectionConfig | null;
  onChange: (value: ModifierSelectionConfig) => void;
};

/** Configures visibility, repetition and presentation without copying shared groups. */
export function ModifierSelectionEditor({ item, set, attachedSets, value, onChange }: Props) {
  const { t } = useI18n();
  const config: ModifierSelectionConfig = value ?? { source: '', source_id: 0, choices: [], presentation: 'auto' };
  const sources = [
    // Orders store one price-bearing option: the first format/size set.
    ...(item.option_sets ?? []).filter(set => set.selection_role !== "identity").slice(0, 1).map(source => ({ key: `option:${source.id}`, name: source.name, choices: (source.options ?? []).filter(o => o.is_active).map(o => ({ id: o.id, name: o.name })) })),
    ...attachedSets.filter(source => source.id !== set.id && !source.use_conversational && (!source.allow_multiple || source.max_selections === 1) && !source.selection_config?.source)
      .map(source => ({ key: `modifier:${source.id}`, name: source.display_name || source.name, choices: source.modifiers.filter(m => m.is_active).map(m => ({ id: m.id, name: m.name })) })),
  ];
  const source = sources.find(source => source.key === `${config.source}:${config.source_id}`);
  const max = Math.max(0, ...config.choices.map(choice => choice.count));
  return <div className="space-y-4 pb-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('modifierSource')}</span>
        <select className="input" value={config.source ? `${config.source}:${config.source_id}` : ''} onChange={event => {
          const [kind, id] = event.target.value.split(':');
          const next = sources.find(source => source.key === event.target.value);
          onChange({ ...config, source: (kind || '') as ModifierSelectionConfig['source'], source_id: Number(id || 0), choices: next?.choices.map(choice => ({ id: choice.id, count: 0 })) ?? [] });
        }}>
          <option value="">{t('modifierAlways')}</option>
          {sources.map(source => <option key={source.key} value={source.key}>{source.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('modifierPresentation')}</span>
        <select className="input" value={config.presentation} onChange={event => onChange({ ...config, presentation: event.target.value as ModifierSelectionConfig['presentation'] })}>
          <option value="auto">{t('modifierAuto')}</option>
          <option value="list">{t('modifierVisibleList')}</option>
          <option value="characters">{t('modifierCharacters')}</option>
        </select>
      </label>
    </div>
    {source && <>
      <p className="text-sm text-[var(--fg-muted)]">{t('modifierRuleHelp')}</p>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {source.choices.map(choice => <label key={choice.id} className="flex min-h-14 items-center justify-between gap-4 py-2 text-sm">
          <span>{choice.name}</span>
          <span className="flex items-center gap-2"><span className="text-xs text-[var(--fg-muted)]">{t('modifierPositions')}</span>
            <input className="input w-20" type="number" min={0} max={12} step={1} aria-label={`${choice.name} — ${t('modifierPositions')}`}
              value={config.choices.find(c => c.id === choice.id)?.count ?? 0}
              onChange={event => onChange({ ...config, choices: source.choices.map(c => ({ id: c.id, count: c.id === choice.id ? Math.max(0, Math.min(12, Math.floor(Number(event.target.value)))) : config.choices.find(saved => saved.id === c.id)?.count ?? 0 })) })} />
          </span>
        </label>)}
      </div>
      {max > 1 && <div className="space-y-2 text-sm">
        <p className="text-[var(--fg-muted)]">{t('modifierRepeatHelp')}</p>
        <div className="flex flex-wrap gap-2" aria-label={t('modifierPreview')}>
          {Array.from({ length: max }, (_, i) => <span key={i} className="border-b-2 border-[var(--fg)] px-3 py-2">{set.display_name || set.name} {i + 1}</span>)}
        </div>
      </div>}
    </>}
  </div>;
}
