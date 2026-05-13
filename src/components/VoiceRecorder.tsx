'use client';

import { useEffect, useRef, useState } from 'react';
import { MicIcon, SquareIcon, Trash2Icon, SendHorizonalIcon } from 'lucide-react';

interface Props {
  /** Called once the user accepts a recording and asks to send it. */
  onSubmit: (blob: Blob, mediaType: string) => void;
  /** Disabled while an upstream request is in flight. */
  disabled?: boolean;
  t: (key: string) => string;
}

/**
 * VoiceRecorder — WhatsApp-style audio capture.
 *
 * Phases:
 *   idle        → "Tap to record"
 *   recording   → live timer + waveform-pulse, Stop button
 *   review      → "X seconds captured", Re-record / Send
 *
 * The recorder uses MediaRecorder with the browser's default Opus/WebM
 * encoder. If the browser doesn't support it we surface an inline error
 * instead of throwing.
 */
export default function VoiceRecorder({ onSubmit, disabled, t }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mediaType, setMediaType] = useState<string>('audio/webm');
  const [error, setError] = useState<string>('');
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Stop everything on unmount.
  useEffect(() => {
    return () => {
      stopMeters();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMeters = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setError('');
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(t('voiceUnsupported'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Pick a mime type the browser actually supports.
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const finalType = rec.mimeType || mime || 'audio/webm';
        // Strip codec suffix for the upload Content-Type — the backend only
        // matches on the base mime prefix.
        const baseType = finalType.split(';')[0];
        setMediaType(baseType);
        const out = new Blob(chunksRef.current, { type: finalType });
        setBlob(out);
        setPhase('review');
        stopMeters();
        stopStream();
      };

      // Live level meter for the recording pulse animation.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const sample = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buf);
          // Peak deviation from 128 ≈ amplitude.
          let max = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128);
            if (v > max) max = v;
          }
          setLevel(Math.min(1, max / 64));
          rafRef.current = requestAnimationFrame(sample);
        };
        sample();
      } catch {
        /* metering is decorative — ignore failures */
      }

      rec.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
      setPhase('recording');
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setError(msg.includes('Permission') || msg.includes('denied') ? t('voicePermissionDenied') : msg);
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  };

  const reset = () => {
    setBlob(null);
    setElapsedMs(0);
    setLevel(0);
    setPhase('idle');
  };

  const send = () => {
    if (blob) onSubmit(blob, mediaType);
  };

  const seconds = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');

  if (error) {
    return (
      <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-600">
        {error}
        <button onClick={() => setError('')} className="ml-3 text-xs underline">{t('retry')}</button>
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          aria-label={t('voiceRecord')}
          className="w-16 h-16 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MicIcon className="w-7 h-7" />
        </button>
        <p className="text-xs text-fg-tertiary text-center max-w-xs">
          {t('voiceHint')}
        </p>
      </div>
    );
  }

  if (phase === 'recording') {
    // Pulse the mic according to live audio level — visible feedback that we
    // actually hear them. Falls back to a baseline pulse if metering failed.
    const scale = 1 + level * 0.6;
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={stopRecording}
          aria-label={t('voiceStop')}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          style={{ transform: `scale(${scale.toFixed(3)})`, transitionDuration: '90ms' }}
        >
          <SquareIcon className="w-6 h-6 fill-current" />
        </button>
        <div className="flex items-center gap-2 text-sm text-fg-primary">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="tabular-nums font-medium">{mm}:{ss}</span>
          <span className="text-fg-tertiary">· {t('voiceRecordingHint')}</span>
        </div>
      </div>
    );
  }

  // review
  return (
    <div className="flex flex-col items-stretch gap-3 py-2">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)]">
        <MicIcon className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-sm text-fg-primary flex-1 truncate">
          {t('voiceReady').replace('{s}', String(seconds))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--divider)] hover:bg-[var(--surface)] text-fg-secondary disabled:opacity-50"
        >
          <Trash2Icon className="w-4 h-4" />
          {t('voiceRerecord')}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={disabled || !blob}
          className="btn-primary text-sm flex-1 inline-flex items-center justify-center gap-2"
        >
          <SendHorizonalIcon className="w-4 h-4" />
          {t('voiceSend')}
        </button>
      </div>
    </div>
  );
}
