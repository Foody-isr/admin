'use client';

import { useEffect, useRef, useState } from 'react';
import { MicIcon, SquareIcon, Trash2Icon, SendHorizonalIcon } from 'lucide-react';
import { Button } from '@/components/ds';

interface Props {
  /** Called once the user accepts a recording and asks to send it. */
  onSubmit: (blob: Blob, mediaType: string) => void;
  /** Report a recording or pending microphone request to the containing draft. */
  onDraftChange?: (dirty: boolean) => void;
  disabled?: boolean;
  t: (key: string) => string;
}

/** Capture a local voice note and upload only after the user chooses Send. */
export default function VoiceRecorder({ onSubmit, onDraftChange, disabled, t }: Props) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'review'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const generation = useRef(0);
  const acquiring = useRef(false);
  const draftChange = useRef(onDraftChange);
  draftChange.current = onDraftChange;

  const release = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    const requestGeneration = generation;
    return () => {
      requestGeneration.current++;
      const active = recorder.current;
      if (active && active.state !== 'inactive') active.stop();
      release();
    };
  }, []);
  useEffect(() => {
    if (!blob) { setPreview(''); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const start = async () => {
    if (disabled || acquiring.current || recorder.current?.state === 'recording') return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('voiceUnsupported'));
      return;
    }
    const request = ++generation.current;
    acquiring.current = true;
    setPhase('requesting');
    draftChange.current?.(true);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (request !== generation.current) {
        captured.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = captured;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find(type => MediaRecorder.isTypeSupported(type));
      const active = mime ? new MediaRecorder(captured, { mimeType: mime }) : new MediaRecorder(captured);
      recorder.current = active;
      const chunks: Blob[] = [];
      active.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
      active.onerror = () => {
        if (request !== generation.current) return;
        generation.current++;
        if (active.state !== 'inactive') active.stop();
        release();
        setPhase('idle');
        setError(t('voiceRecordingFailed'));
        draftChange.current?.(false);
      };
      active.onstop = () => {
        if (request !== generation.current) return;
        release();
        const result = new Blob(chunks, { type: active.mimeType || mime || 'audio/webm' });
        if (!result.size) {
          setPhase('idle');
          setError(t('voiceRecordingFailed'));
          draftChange.current?.(false);
          return;
        }
        setBlob(result);
        setPhase('review');
      };
      active.start(250);
      startedAt.current = Date.now();
      setElapsedMs(0);
      timer.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 200);
      setPhase('recording');
    } catch (cause) {
      if (request !== generation.current) return;
      release();
      setPhase('idle');
      const denied = cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name);
      setError(denied ? t('voicePermissionDenied') : t('voiceRecordingFailed'));
      draftChange.current?.(false);
    } finally {
      if (request === generation.current) acquiring.current = false;
    }
  };
  const stop = () => {
    const active = recorder.current;
    if (active && active.state !== 'inactive') {
      setElapsedMs(Date.now() - startedAt.current);
      active.stop();
    }
  };
  const reset = () => {
    if (disabled) return;
    setBlob(null);
    setElapsedMs(0);
    setError('');
    setPhase('idle');
    draftChange.current?.(false);
  };
  const send = () => {
    if (!blob || disabled) return;
    if (elapsedMs < 1500) { setError(t('voiceTooShort')); return; }
    onSubmit(blob, blob.type.split(';')[0]);
  };
  const seconds = Math.floor(elapsedMs / 1000);
  const duration = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-4 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
      {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}
      {(phase === 'idle' || phase === 'requesting') && <>
        <p className="text-sm text-fg-secondary">{t('voiceHint')}</p>
        <Button type="button" size="lg" className="w-full" disabled={disabled || phase === 'requesting'} onClick={() => void start()}>
          <MicIcon />{t(phase === 'requesting' ? 'voiceRequesting' : 'voiceRecord')}
        </Button>
      </>}
      {phase === 'recording' && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm"><bdi className="tabular-nums text-lg font-semibold">{duration}</bdi><p className="text-fg-secondary">{t('voiceRecordingHint')}</p></div>
        <Button type="button" size="lg" variant="secondary" onClick={stop}><SquareIcon />{t('voiceStop')}</Button>
      </div>}
      {phase === 'review' && <>
        <p role="status" className="text-sm font-medium">{t('voiceReady').replace('{s}', String(seconds))}</p>
        {preview && <audio controls src={preview} aria-label={t('voicePreview')} className="w-full min-w-0" />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" variant="secondary" onClick={reset} disabled={disabled}><Trash2Icon />{t('voiceRerecord')}</Button>
          <Button type="button" size="lg" className="flex-1" onClick={send} disabled={disabled || !blob}><SendHorizonalIcon />{t('voiceSend')}</Button>
        </div>
      </>}
    </div>
  );
}
