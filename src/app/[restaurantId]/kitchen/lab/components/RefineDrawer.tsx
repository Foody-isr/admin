'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Drawer } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { ChatMessage, ChatPatch } from '../types';

type Message=Pick<ChatMessage,'role'|'content'>;
/** Accessible conversation drawer retaining server history and failed input. */
export function RefineDrawer({open,onClose,onSend,initialHistory,onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void;open:boolean;onClose:()=>void;initialHistory:ChatMessage[];onSend:(message:string)=>Promise<{assistant_message:string;patches:ChatPatch[]}>}) {
  const {t}=useI18n();
  const [text,setText]=useState('');
  const [history,setHistory]=useState<Message[]>(initialHistory);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const lock=useRef(false);
  const end=useRef<HTMLDivElement>(null);
  const field=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{onDirtyChange(!!text.trim());},[text,onDirtyChange]);
  useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[history,busy]);
  const send=async()=>{const message=text.trim();if(!message||lock.current)return;lock.current=true;setBusy(true);setError(null);try{const result=await onSend(message);setHistory(current=>[...current,{role:'user',content:message},{role:'assistant',content:result.assistant_message}]);setText('');}catch(cause){setError(cause instanceof Error?cause.message:t('labRefineError'));}finally{lock.current=false;setBusy(false);field.current?.focus();}};
  return <Drawer open={open} onOpenChange={value=>{if(!value)onClose();}} title={t('labRefineTitle')} width={480} closeDisabled={busy} initialFocusRef={field} footer={<div><label htmlFor="lab-refine-message" className="mb-2 block text-sm font-medium">{t('labRefinePlaceholder')}</label><textarea id="lab-refine-message" ref={field} dir="auto" rows={3} value={text} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} className="w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-base" />{error&&<p role="alert" className="mt-2 text-sm text-[var(--danger-500)]">{error}</p>}<Button className="mt-3 w-full" disabled={busy||!text.trim()} onClick={()=>void send()}>{busy?t('labRefineThinking'):t('labRefineSend')}</Button></div>}>
    <div role="log" aria-label={t('labRefineTitle')} className="space-y-3">{history.length===0&&<p className="text-sm leading-6 text-[var(--fg-muted)]">{t('labRefineExamples')}</p>}{history.map((message,index)=><div key={index} dir="auto" className={`whitespace-pre-wrap break-words rounded-[8px] p-3 text-sm leading-6 ${message.role==='user'?'ms-8 bg-[var(--brand-soft)]':'me-8 bg-[var(--surface)]'}`}><span className="sr-only">{message.role==='user'?t('labMessageYou'):t('labMessageAssistant')}: </span>{message.content}</div>)}{busy&&<p role="status">{t('labRefineThinking')}</p>}<div ref={end}/></div>
  </Drawer>;
}
