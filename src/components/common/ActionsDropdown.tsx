'use client';

import { ChevronDownIcon, MoreHorizontalIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import ActionMenu, { type ActionMenuEntry } from './ActionMenu';

export type ActionItem = ActionMenuEntry;

/** Page actions with a compact, named trigger on narrow screens. */
export default function ActionsDropdown({label,actions,compactOnMobile=false}: {
  label?:string;actions:ActionItem[];compactOnMobile?:boolean;
}) {
  const {t} = useI18n();
  const name = label ?? t('actions');
  return <ActionMenu label={name} actions={actions} className={compactOnMobile ? 'max-md:size-11 max-md:justify-center max-md:px-0' : ''}>
    {compactOnMobile && <MoreHorizontalIcon className="md:hidden" aria-hidden/>}
    <span className={compactOnMobile ? 'max-md:sr-only' : undefined}>{name}</span>
    <ChevronDownIcon className={compactOnMobile ? 'max-md:hidden' : undefined} aria-hidden/>
  </ActionMenu>;
}
