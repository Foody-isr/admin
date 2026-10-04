'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAi } from '@/lib/ai-context';
import { useI18n } from '@/lib/i18n';
import { Button, Drawer } from '@/components/ds';
import AiChat from './AiChat';

/** Accessible assistant drawer; the unsent draft survives closing and reopening. */
export default function AiDrawer() {
  const { isOpen, closeDrawer, clearChat, messages } = useAi();
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  return (
    <Drawer open={isOpen} onOpenChange={open => { if (!open) closeDrawer(); }} title={t('aiAssistant')} width={420}
      bodyClassName="flex flex-col p-0 overflow-hidden"
      primaryAction={messages.length > 0 ? <Button variant="ghost" icon aria-label={t('aiClearChat')} onClick={clearChat}><Trash2 /></Button> : undefined}>
      <AiChat input={draft} onInputChange={setDraft} />
    </Drawer>
  );
}
