'use client';

import { useState } from 'react';
import { BooleanInput, ChoiceRow } from '@/components/ds/Selection';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/lib/i18n';

/** Interactive reference for selection, keyboard, form and disabled states. */
export function SelectionExamples() {
  const { t } = useI18n();
  const [mode, setMode] = useState('immediate');
  const [enabled, setEnabled] = useState(false);
  const [mixed, setMixed] = useState<boolean | 'indeterminate'>('indeterminate');
  return <form aria-label="Selection examples" className="max-w-2xl" onSubmit={event => event.preventDefault()}>
    <fieldset className="choice-group"><legend>{t('intakeTitle')}</legend>
      {['immediate', 'preorder', 'mixed'].map(value => <ChoiceRow key={value} type="radio" name="mode" value={value} label={t(`intakeMode_${value}`)} checked={mode === value} onChange={() => setMode(value)} />)}
    </fieldset>
    <fieldset className="choice-group mt-6"><legend>{t('orderModesTitle')}</legend>
      <ChoiceRow name="services" value="pickup" label={t('pickup')} />
      <ChoiceRow name="services" value="delivery" label={t('delivery')} />
    </fieldset>
    <div className="boolean-setting"><label htmlFor="example-switch">{t('enableTips')}</label><Switch id="example-switch" checked={enabled} onCheckedChange={setEnabled} /></div>
    <label className="boolean-setting"><span>{t('notifications')}</span><BooleanInput name="notifications" defaultChecked /></label>
    <fieldset disabled className="boolean-setting"><label><span>{t('pauseSectionTitle')}</span><BooleanInput name="disabled" defaultChecked aria-label="Disabled native switch" /></label><Switch aria-label="Disabled switch" checked /></fieldset>
    <label className="choice-row"><span>Indeterminate</span><Checkbox checked={mixed} onCheckedChange={setMixed} /></label>
  </form>;
}
