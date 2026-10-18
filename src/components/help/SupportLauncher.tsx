'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUp, ExternalLink, HelpCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Drawer, Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { askSupportAssistant, type SupportAnswer, type SupportTurn } from '@/lib/api';
import { HELP_BASE_URL } from '@/lib/help/registry';
import { supportTopicForPath } from '@/lib/help/context';

type Turn = SupportTurn & { sources?: SupportAnswer['sources'] };

/** Contextual support available to all staff, grounded in the public Foody documentation. */
export default function SupportLauncher() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const restaurantContext = pathname.split('/')[1];
  const helpUrl = `${HELP_BASE_URL.replace(/\/$/, '')}/${locale}/help`;
  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight }); }, [turns, busy, error]);
  useEffect(() => () => controller.current?.abort(), []);
  // A locale change must not send the previous locale's conversation as new history.
  useEffect(() => { controller.current?.abort(); setTurns([]); setQuestion(''); setError(''); setDraft(''); }, [locale, restaurantContext]);

  async function send(message: string) {
    if (!message.trim() || lock.current) return;
    lock.current = true; setBusy(true); setQuestion(message); setError(''); setDraft('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const answer = await askSupportAssistant(message, locale, turns, supportTopicForPath(pathname), AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]));
      if (abort.signal.aborted) return;
      setTurns(current => [...current, { role: 'user', content: message }, { role: 'assistant', content: answer.answer, sources: answer.sources }]);
      setQuestion('');
    } catch (e) {
      if (!abort.signal.aborted) { setError(e instanceof Error && e.message === 'supportLimit' ? 'supportLimit' : 'supportUnavailable'); setDraft(message); }
    } finally { setBusy(false); lock.current = false; }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={t('supportOpen')} title={t('supportOpen')}
      className="flex-1 h-11 flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--fg)]"><HelpCircle className="size-4" /></button>
    <Drawer open={open} onOpenChange={setOpen} title={t('supportTitle')} width={460} bodyClassName="flex flex-col p-0 overflow-hidden"
      primaryAction={<Button variant="ghost" icon aria-label={t('supportReset')} disabled={busy} onClick={() => { setTurns([]); setQuestion(''); setError(''); setDraft(''); }}><RotateCcw /></Button>}>
      <div ref={conversation} className="min-h-0 flex-1 overflow-y-auto p-6">
        {!turns.length && !question && <div className="pt-8 text-center">
          <Sparkles className="mx-auto size-8 text-[var(--brand-500)]" /><h2 className="mx-auto mt-6 mb-4 max-w-[18ch] text-3xl font-semibold leading-tight">{t('supportHeading')}</h2>
          <p className="text-sm text-[var(--fg-muted)]">{t('supportDescription')}</p>
          <div className="mt-8 text-start">{['supportSuggestionMenu', 'supportSuggestionStock', 'supportSuggestionOrders'].map(key => <button key={key} disabled={busy} onClick={() => void send(t(key))} className="w-full border-b border-[var(--line)] py-4 text-start text-sm hover:text-[var(--brand-500)]">{t(key)}</button>)}</div>
        </div>}
        <div role="log" aria-live="polite" aria-relevant="additions text">
          {turns.map((turn, i) => <div className="mb-6" key={i}>
            <span className="mb-2 block text-xs font-semibold text-[var(--fg-muted)]">{t(turn.role === 'user' ? 'supportYou' : 'supportTitle')}</span>
            <div className={`whitespace-pre-wrap break-words text-sm leading-7 ${turn.role === 'user' ? 'rounded-2xl bg-[var(--surface-2)] p-4' : ''}`}>{turn.content}</div>
            {!!turn.sources?.length && <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-3 text-xs"><strong>{t('supportSources')}</strong>{turn.sources.map(source => <a className="text-[var(--brand-500)] underline" key={source.id} href={`${HELP_BASE_URL.replace(/\/$/, '')}${source.url}`} target="_blank" rel="noopener noreferrer">{source.title}{source.lang !== locale && ` (${t('supportEnglish')})`}</a>)}</div>}
          </div>)}
          {question && <div className="mb-6 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">{question}</div>}
        </div>
        {busy && <p role="status" className="text-sm text-[var(--fg-muted)]">{t('supportBusy')}</p>}
        {error && <p role="alert" className="rounded-lg bg-[var(--surface-2)] p-4 text-sm">{t(error)}</p>}
      </div>
      <div className="shrink-0 border-t border-[var(--line)] p-4">
        <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-center gap-2 text-sm font-medium">{t('supportBrowse')}<ExternalLink className="size-3.5" /></a>
        <form onSubmit={e => { e.preventDefault(); void send(draft); }} className="flex items-end gap-2 rounded-2xl border border-[var(--line)] p-3 focus-within:ring-2 focus-within:ring-[var(--brand-500)]">
          <textarea aria-label={t('supportPlaceholder')} value={draft} maxLength={1500} rows={2} onChange={e => setDraft(e.target.value)} placeholder={t('supportPlaceholder')}
            className="min-w-0 flex-1 resize-none border-0 bg-transparent text-sm outline-none"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} />
          <Button type="submit" icon disabled={busy || !draft.trim()} aria-label={t('supportSend')}><ArrowUp /></Button>
        </form>
        <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">{t('supportPrivacy')}</p>
        <a className="mt-2 inline-block text-xs underline" href="mailto:support@foody-pos.co.il">{t('supportContact')}</a>
      </div>
    </Drawer>
  </>;
}
