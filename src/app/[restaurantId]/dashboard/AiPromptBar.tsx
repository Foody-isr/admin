'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Pin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAi } from '@/lib/ai-context';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds';

const PROMPTS = ['aiPromptPlaceholder1', 'aiPromptPlaceholder2', 'aiPromptPlaceholder3', 'aiPromptPlaceholder4'];

/** Home prompt opens the existing assistant; pinned suggestions can be edited before sending. */
export default function AiPromptBar() {
  const { t } = useI18n();
  const { sendMessage, openDrawer, isStreaming } = useAi();
  const [input, setInput] = useState('');
  const [placeholder, setPlaceholder] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focused || input) return;
    const timer = setInterval(() => setPlaceholder((old) => (old + 1) % PROMPTS.length), 6000);
    return () => clearInterval(timer);
  }, [focused, input]);
  return <section className="dashboard-card dashboard-prompt" aria-label={t('askFoodyAi')}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!input.trim() || isStreaming) return;
      void sendMessage(input.trim());
      openDrawer();
      setInput('');
    }}>
      <input ref={inputRef} aria-label={t('askFoodyAi')} placeholder={t(PROMPTS[placeholder])} value={input}
        onChange={(event) => setInput(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <button type="submit" className="dashboard-prompt-submit" aria-label={t('aiAsk')} disabled={!input.trim() || isStreaming}><ArrowUp size={24} /></button>
    </form>
    <Menu><MenuTrigger asChild><button type="button" className="dashboard-pins"><Pin size={16} />{t('aiPins')}</button></MenuTrigger>
      <MenuContent align="start" onCloseAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
        {PROMPTS.map((key) => <MenuItem key={key} onSelect={() => setInput(t(key))}>{t(key)}</MenuItem>)}
      </MenuContent>
    </Menu>
  </section>;
}
