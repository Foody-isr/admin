'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, ImagePlus, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, PageHead,
  Tab, Tabs, TabsContent, TabsList,
} from '@/components/ds';
import {
  ApiError, generateWalletStudioTest, getStoredUser, getWalletStudio, saveWalletStudio,
  type WalletStudioDesign, type WalletStudioState,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

type Draft = { background: string; foreground: string; logo: string | null; banner: string | null };
type Action = 'save' | 'generate' | 'image';
const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const testBarcode = 'FOODY-WALLET-STUDIO-TEST';

function fromDesign(design: WalletStudioDesign): Draft {
  return {
    background: design.background_color,
    foreground: design.foreground_color,
    logo: design.logo_png && `data:image/png;base64,${design.logo_png}`,
    banner: design.banner_png && `data:image/png;base64,${design.banner_png}`,
  };
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid image'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Keeps private drafts scoped to the active restaurant and staff session. */
export default function WalletStudioWorkspace() {
  const { restaurantId } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [actor, setActor] = useState<number | null>(null);
  useEffect(() => {
    const check = () => setActor(getStoredUser()?.id ?? 0);
    check();
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, [user?.id]);
  if (actor === null) return <p role="status">{t('loading')}</p>;
  if (!user?.id || actor !== user.id) return <p role="alert">{t('loyaltyProgramForbidden')}</p>;
  return <Studio key={`${restaurantId}:${actor}`} rid={Number(restaurantId)} actor={actor} />;
}

function Studio({ rid, actor }: { rid: number; actor: number }) {
  const { t } = useI18n();
  const [state, setState] = useState<WalletStudioState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passURL, setPassURL] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const saved = useMemo(() => state && fromDesign(state.design), [state]);
  const dirty = !!draft && !!saved && (
    draft.background !== saved.background || draft.foreground !== saved.foreground ||
    draft.logo !== saved.logo || draft.banner !== saved.banner
  );
  const valid = !!draft && isColor(draft.background) && isColor(draft.foreground);
  const stale = error === 'walletStudioConflict';
  const canSave = state?.can_edit && valid && (dirty || state.design.revision === 0) && !stale;

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError('');
    setMessage('');
    setPassURL(null);
    getWalletStudio(rid, request.signal).then((result) => {
      if (request.signal.aborted) return;
      if (result.restaurant_id !== rid) throw new Error('restaurant mismatch');
      setState(result);
      setDraft(fromDesign(result.design));
    }).catch((failure: unknown) => {
      if (request.signal.aborted) return;
      setState(null);
      setDraft(null);
      setError(failure instanceof ApiError && failure.status === 403 ? 'loyaltyProgramForbidden' : 'walletStudioLoadError');
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => {
      request.abort();
      operation.current?.abort();
    };
  }, [rid, reload]);

  useEffect(() => {
    if (passURL) return () => URL.revokeObjectURL(passURL);
  }, [passURL]);

  function change(patch: Partial<Draft>) {
    setDraft(current => current && { ...current, ...patch });
    setError('');
    setMessage('');
    setPassURL(null);
  }

  async function perform(mode: Action, task: (signal: AbortSignal) => Promise<void>) {
    if (operation.current || getStoredUser()?.id !== actor) return;
    const controller = new AbortController();
    operation.current = controller;
    setAction(mode);
    setError('');
    setMessage('');
    try {
      await task(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 403) {
        setState(null);
        setDraft(null);
        setPassURL(null);
        setError('loyaltyProgramForbidden');
      } else if (failure instanceof ApiError && failure.message === 'loyalty_conflict') {
        setError('walletStudioConflict');
      } else if (mode === 'image' || failure instanceof ApiError && [400, 413, 415].includes(failure.status)) {
        setError('walletStudioImageError');
      } else {
        setError(mode === 'generate' ? 'walletStudioSignError' : 'walletStudioSaveError');
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setAction(null);
    }
  }

  function pick(slot: 'logo' | 'banner', file: File) {
    void perform('image', async (signal) => {
      if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('invalid image');
      const value = await readImage(file);
      if (!signal.aborted) change({ [slot]: value });
    });
  }

  function save() {
    if (!state || !draft || !canSave) return;
    void perform('save', async (signal) => {
      const design = await saveWalletStudio(rid, state.design.revision, {
        background_color: draft.background,
        foreground_color: draft.foreground,
        logo_png: draft.logo?.split(',')[1] ?? null,
        banner_png: draft.banner?.split(',')[1] ?? null,
      }, signal);
      if (signal.aborted) return;
      setState({ ...state, design });
      setDraft(fromDesign(design));
      setMessage('walletStudioSaved');
    });
  }

  function generate() {
    if (!state?.can_edit || !state.can_sign_test || !state.program || !state.design.revision || dirty || stale) return;
    void perform('generate', async (signal) => {
      const pass = await generateWalletStudioTest(rid, state.design.revision, signal);
      if (signal.aborted) return;
      setPassURL(URL.createObjectURL(pass));
      setMessage('walletStudioReady');
    });
  }

  return (
    <div className="min-w-0 pb-16">
      <PageHead title={t('walletStudioTitle')} desc={t('walletStudioIntro')} actions={
        <Button asChild variant="secondary">
          <Link href={`/${rid}/loyalty/program`}>{t('walletStudioBack')}</Link>
        </Button>
      } />
      {loading && <p role="status">{t('loading')}</p>}
      {error && <p className="mb-4 border-s-2 border-[var(--danger-500)] ps-3 text-sm" role="alert">{t(error)}</p>}
      {message && <p className="mb-4 border-s-2 border-[var(--info-500)] ps-3 text-sm" role="status">{t(message)}</p>}
      {!loading && (!state || stale) && (
        <Button variant="secondary" className="mb-4" onClick={() => setReload(value => value + 1)}>
          {t(dirty ? 'walletStudioDiscardReload' : 'walletStudioReload')}
        </Button>
      )}
      {!loading && state && draft && (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{t('walletStudioAppearance')}</CardTitle>
                <Badge tone="neutral">{t('walletStudioDraft')}</Badge>
              </CardHeader>
              <CardBody>
                <fieldset className="min-w-0 space-y-5" disabled={!state.can_edit || !!action || stale}>
                  <legend className="sr-only">{t('walletStudioAppearance')}</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField id="wallet-background" label={t('walletStudioBackground')} value={draft.background}
                      fallback={state.design.background_color} onChange={background => change({ background })} />
                    <ColorField id="wallet-foreground" label={t('walletStudioForeground')} value={draft.foreground}
                      fallback={state.design.foreground_color} onChange={foreground => change({ foreground })} />
                  </div>
                  <p className="text-xs text-[var(--fg-muted)]">{t('walletStudioAppleText')}</p>
                  <div className="space-y-3 border-t border-[var(--line)] pt-4">
                    <AssetField id="wallet-logo" label={t('walletStudioLogo')} image={draft.logo}
                      onPick={file => pick('logo', file)} onRemove={() => change({ logo: null })} />
                    <AssetField id="wallet-banner" label={t('walletStudioBanner')} image={draft.banner}
                      onPick={file => pick('banner', file)} onRemove={() => change({ banner: null })} />
                    <p className="text-xs text-[var(--fg-muted)]">{t('walletStudioImageHint')}</p>
                  </div>
                  {state.can_edit && <Button disabled={!canSave} onClick={save}>{t('walletStudioSave')}</Button>}
                </fieldset>
                {!state.can_edit && <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('walletStudioReadOnly')}</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone size={18} aria-hidden="true" />{t('walletStudioTestCard')}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-[var(--fg-muted)]">{t('walletStudioTestHint')}</p>
                {!state.can_sign_test ? <p className="text-sm text-[var(--fg-muted)]">{t('walletStudioSigningOff')}</p>
                  : !state.program ? <p className="text-sm text-[var(--fg-muted)]">{t('walletStudioNeedsProgram')}</p>
                    : (dirty || !state.design.revision) && <p className="text-sm text-[var(--fg-muted)]">{t('walletStudioSaveFirst')}</p>}
                {state.can_edit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" disabled={!state.can_sign_test || !state.program || !state.design.revision || dirty || stale || !!action} onClick={generate}>
                      {t(action === 'generate' ? 'walletStudioGenerating' : 'walletStudioGenerate')}
                    </Button>
                    {passURL && (
                      <Button asChild>
                        <a href={passURL} download="foody-wallet-test.pkpass"><Download aria-hidden="true" />{t('walletStudioDownload')}</a>
                      </Button>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
          <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <Card className="overflow-hidden">
              <CardHeader><CardTitle>{t('walletStudioPreview')}</CardTitle></CardHeader>
              <CardBody className="bg-[var(--surface-subtle)]">
                <Tabs defaultValue="apple">
                  <TabsList aria-label={t('walletStudioPreview')} className="mx-auto max-w-full">
                    <Tab value="apple">Apple Wallet</Tab>
                    <Tab value="google">Google Wallet</Tab>
                  </TabsList>
                  <TabsContent value="apple"><Preview platform="apple" state={state} draft={draft} /></TabsContent>
                  <TabsContent value="google"><Preview platform="google" state={state} draft={draft} /></TabsContent>
                </Tabs>
                <p className="mt-4 text-center text-xs text-[var(--fg-muted)]">{t('walletStudioPreviewHint')}</p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorField({ id, label, value, fallback, onChange }: {
  id: string; label: string; value: string; fallback: string; onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex min-w-0 items-center gap-2">
        <input type="color" value={isColor(value) ? value : fallback}
          aria-label={`${label} (${t('walletStudioPicker')})`}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--surface)] p-1 focus-visible:outline focus-visible:outline-2"
          onChange={e => onChange(e.target.value.toUpperCase())} />
        <Input id={id} dir="ltr" maxLength={7} value={value} aria-invalid={!isColor(value)} onChange={e => onChange(e.target.value.toUpperCase())} />
      </div>
    </div>
  );
}

function AssetField({ id, label, image, onPick, onRemove }: {
  id: string; label: string; image: string | null; onPick: (file: File) => void; onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md border border-[var(--line)] p-2 focus-within:shadow-ring">
        <span className="grid h-11 w-12 shrink-0 place-items-center overflow-hidden rounded bg-[var(--surface-2)]">
          {image ? <Image unoptimized src={image} alt="" width={48} height={44} className="h-full w-full object-contain" /> : <ImagePlus size={18} aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-[var(--fg-muted)]">{t(image ? 'walletStudioReplace' : 'walletStudioChoose')}</span>
        </span>
        <input className="sr-only" id={id} aria-label={label} type="file" accept="image/png,image/jpeg" onChange={e => {
          const file = e.currentTarget.files?.[0];
          if (file) onPick(file);
          e.currentTarget.value = '';
        }} />
      </label>
      {image && <Button variant="ghost" size="sm" aria-label={`${t('walletStudioRemove')} ${label}`} onClick={onRemove}>{t('walletStudioRemove')}</Button>}
    </div>
  );
}

function Preview({ platform, state, draft }: { platform: 'apple' | 'google'; state: WalletStudioState; draft: Draft }) {
  const { t, locale } = useI18n();
  const apple = platform === 'apple';
  const background = isColor(draft.background) ? draft.background : state.design.background_color;
  const text = isColor(draft.foreground) ? draft.foreground : state.design.foreground_color;
  const rgb = [1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16));
  const googleText = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? '#202124' : '#FFFFFF';
  const title = state.program?.names[locale] || t('loyaltyProgramTitle');
  const unit = t(state.program?.mode === 'points' ? 'loyaltyProgramPoints' : 'loyaltyProgramVisits');
  const threshold = state.program?.threshold ?? 2;
  const progress = Math.min(1, threshold - 1);
  const progressFields = (
    <div>
      <div className="text-xs font-medium">{unit}</div>
      <div className="text-[2rem] font-semibold leading-tight tabular-nums">{progress}</div>
    </div>
  );
  return (
    <div data-wallet-preview={platform} className="mx-auto max-w-[23rem] overflow-hidden rounded-[1.35rem] border border-black/10 shadow-2"
      style={{ backgroundColor: background, color: apple ? text : googleText }}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-2">
          {(draft.logo || !apple) && (
            <Image unoptimized src={draft.logo ?? '/brand/foody-symbol.svg'} alt="" width={apple ? 72 : 36} height={36}
              className={apple ? 'h-9 max-w-[4.5rem] object-contain' : 'h-9 w-9 rounded-full bg-white p-0.5 object-contain'} />
          )}
          <div className="min-w-0 break-words text-sm font-semibold leading-tight">
            {!apple && <div className="text-xs font-normal">Foody</div>}
            {apple ? state.restaurant_name : title}
          </div>
        </div>
        {apple && <span className="max-w-[45%] text-end text-xs font-medium">{t('walletStudioTestCard')}</span>}
      </div>
      {apple && draft.banner ? (
        <div className="relative aspect-[375/144] overflow-hidden">
          <Image unoptimized src={draft.banner} alt="" fill className="object-cover" />
          <div className="absolute inset-0 px-4 py-3">{progressFields}</div>
        </div>
      ) : <div className="px-4 pb-2">{progressFields}</div>}
      <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs">
        {apple && <span className="break-words font-medium">{title}</span>}
        <span>{t('walletStudioThreshold')} <b className="tabular-nums">{threshold}</b></span>
      </div>
      {!apple && draft.banner && (
        <div className="relative aspect-[1032/336] overflow-hidden"><Image unoptimized src={draft.banner} alt="" fill className="object-cover" /></div>
      )}
      <div className="flex justify-center p-4">
        <div className="rounded-lg bg-white p-2" aria-hidden="true"><QRCodeSVG value={testBarcode} size={90} marginSize={1} /></div>
      </div>
    </div>
  );
}
