'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import ActionMenu, { type ActionMenuEntry } from './ActionMenu';

export type RowAction = ActionMenuEntry;

/** Contextual table actions, accessible by pointer, touch and keyboard. */
export default function RowActionsMenu({actions,label}: {actions:RowAction[];label?:string}) {
  const {t} = useI18n();
  return <ActionMenu actions={actions} label={label ?? t('actions')} iconOnly><MoreHorizontalIcon aria-hidden/></ActionMenu>;
}
