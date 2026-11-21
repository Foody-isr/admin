'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Crop, Download, ImagePlus, LoaderCircle, Smartphone, Sparkles, Undo2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Badge, BooleanInput, Button, Card, CardBody, CardHeader, CardTitle, Input, PageHead,
  Tab, Tabs, TabsContent, TabsList,
} from '@/components/ds';
import {
  ApiError, generateWalletStudioTest, getStoredUser, getWalletStudio, getWalletWebsiteDesign, publishWalletStudio, saveWalletStudio,
  type WalletStudioDesign, type WalletStudioState,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { loyaltyCustomerPage } from '@/lib/loyalty-program';
import { defaultBannerLayout, originalImageURL, readBannerOriginal, renderWalletBanners, sameBannerLayout, walletFrame, walletThumbnail, type WalletBannerLayout, type WalletPlatform } from '@/lib/wallet-banner';
import { proposeWebsiteDesign } from '@/lib/wallet-website-design';
import type { ImageFrame } from '@/lib/website-v3/image-framing';
import { FramedWalletBanner, WalletBannerControls } from './WalletBannerFraming';

type AssetSlot = 'logo' | 'banner';
type Draft = { background: string; foreground: string; hideRestaurantName: boolean; logo: string | null; banner: string | null; original: string | null; layout: WalletBannerLayout | null };
type Action = 'save' | 'publish' | 'generate' | 'website' | AssetSlot;
const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const palettes = [
  {label:'earnPaletteCoffee',background:'#3E2924',foreground:'#FFF3DF'},
  {label:'earnPaletteCitrus',background:'#FFE891',foreground:'#302710'},
  {label:'earnPaletteHerb',background:'#C4E0C4',foreground:'#18372B'},
] as const;
const templates: {name:string;layout:WalletBannerLayout}[] = [
  {name:'earnLayoutProduct',layout:defaultBannerLayout()},
  {name:'earnLayoutPanorama',layout:{shared:{fit:'cover',x:50,y:50,zoom:1},apple_counter:'below'}},
  {name:'earnLayoutOverlay',layout:{shared:{fit:'cover',x:50,y:50,zoom:1},apple_counter:'overlay'}},
];
const testBarcode = 'FOODY-WALLET-STUDIO-TEST';
const legacyLayout: WalletBannerLayout = { shared: { fit: 'cover', x: 50, y: 50, zoom: 1 }, apple_counter: 'overlay' };

function fromDesign(design: WalletStudioDesign): Draft {
  return {
    background: design.background_color,
    foreground: design.foreground_color,
    hideRestaurantName: design.hide_restaurant_name ?? false,
    logo: design.logo_png && `data:image/png;base64,${design.logo_png}`,
    banner: design.banner_png && `data:image/png;base64,${design.banner_png}`,
    original: design.banner_original ? originalImageURL(design.banner_original) : null,
    layout: design.banner_layout ?? null,
  };
}

async function prepareArtwork(file: File, slot: AssetSlot): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || (slot === 'banner' && (width > 16384 || height > 16384 || width * height > 50_000_000))) throw new Error('Unreadable image');
    return walletThumbnail(image, slot === 'banner' ? 750 : 320);
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const [imageError, setImageError] = useState<{ slot: AssetSlot; key: string } | null>(null);
  const [passURL, setPassURL] = useState<string | null>(null);
  const [platform, setPlatform] = useState<WalletPlatform>('apple');
  const [framing, setFraming] = useState(false);
  const [websiteImport, setWebsiteImport] = useState<{ before: Draft; parts: string[]; partial: boolean } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const saved = useMemo(() => state && fromDesign(state.design), [state]);
  const frameChanged = !!draft && !!saved && (draft.banner !== saved.banner || draft.original !== saved.original || !sameBannerLayout(draft.layout, saved.layout));
  const dirty = !!draft && !!saved && (
    draft.background !== saved.background || draft.foreground !== saved.foreground ||
    draft.hideRestaurantName !== saved.hideRestaurantName || draft.logo !== saved.logo || frameChanged
  );
  const valid = !!draft && isColor(draft.background) && isColor(draft.foreground);
  const stale = error === 'walletStudioConflict';
  const canSave = state?.can_edit && valid && (dirty || state.design.revision === 0) && !stale;
  const publishedRevision = state?.published_revision;
  const publicationStatus = !publishedRevision ? 'walletStudioUnpublishedStatus'
    : publishedRevision === state?.design.revision ? 'walletStudioPublishedStatus' : 'walletStudioChangesToPublish';
  const customerPage = loyaltyCustomerPage(rid);
  const canPublish = state?.can_edit && state.program && publishedRevision !== undefined &&
    state.design.revision > publishedRevision && !dirty && !stale;

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setWebsiteImport(null);
    setError('');
    setImageError(null);
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
    setWebsiteImport(null);
    setDraft(current => current && { ...current, ...patch });
    setImageError(current => current && current.slot in patch ? null : current);
    setError('');
    setMessage('');
    setPassURL(null);
  }

  const [sample,setSample]=useState(1);
  const layout = draft?.layout ?? legacyLayout;
  function adjustFrame(frame: ImageFrame) {
    change({ layout: platform === 'google' && layout.google ? { ...layout, google: frame } : { ...layout, shared: frame } });
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
      } else if (mode === 'website') {
        setError('walletStudioWebsiteError');
      } else if (mode === 'logo' || mode === 'banner') {
        setImageError({ slot: mode, key: 'walletStudioImageReadError' });
      } else if (mode === 'save' && failure instanceof ApiError && [400, 413, 415].includes(failure.status)) {
        setError('walletStudioImageError');
      } else {
        setError(mode === 'publish' ? 'walletStudioPublishError' : mode === 'generate' ? 'walletStudioSignError' : 'walletStudioSaveError');
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setAction(null);
    }
  }

  function pick(slot: AssetSlot, file: File) {
    void perform(slot, async (signal) => {
      setImageError(null);
      const supported = file.type ? ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) : /\.(png|jpe?g|webp)$/i.test(file.name);
      if (!supported || file.size > 10 * 1024 * 1024) {
        setImageError({ slot, key: supported ? 'walletStudioImageSizeError' : 'walletStudioImageFormatError' });
        return;
      }
      const value = await prepareArtwork(file, slot);
      if (slot === 'banner') {
        const original = await readBannerOriginal(file);
        if (!signal.aborted) change({ banner: value, original, layout: draft?.layout ?? defaultBannerLayout() });
      } else if (!signal.aborted) change({ logo: value });
    });
  }

  function generateFromWebsite() {
    if (!state?.can_edit || !draft || stale) return;
    void perform('website', async signal => {
      const source = await getWalletWebsiteDesign(rid, signal);
      if (source.restaurant_id !== rid) throw new Error('Website restaurant mismatch');
      if (signal.aborted || getStoredUser()?.id !== actor) return;
      const { patch, missingImages } = await proposeWebsiteDesign(source);
      if (signal.aborted || getStoredUser()?.id !== actor) return;
      const parts = [];
      if (patch.background) parts.push('walletStudioColors');
      if (patch.logo) parts.push('walletStudioLogo');
      if (patch.banner) parts.push('walletStudioBanner');
      if (!parts.length) {
        if (missingImages) setError('walletStudioWebsiteMediaError');
        else setMessage('walletStudioWebsiteEmpty');
        return;
      }
      const same = (!patch.background || patch.background === draft.background && patch.foreground === draft.foreground)
        && (!patch.logo || patch.logo === draft.logo)
        && (!patch.banner || patch.banner === draft.banner && patch.original === draft.original && sameBannerLayout(patch.layout ?? null, draft.layout));
      if (same) {
        setMessage(missingImages ? 'walletStudioWebsitePartial' : 'walletStudioWebsiteCurrent');
        return;
      }
      change(patch);
      setWebsiteImport({ before: draft, parts, partial: missingImages });
    });
  }

  function save() {
    if (!state || !draft || !canSave) return;
    void perform('save', async (signal) => {
      const renders = frameChanged && draft.layout && draft.banner ? await renderWalletBanners(draft.original ?? draft.banner, draft.layout) : {};
      if (signal.aborted) return;
      const design = await saveWalletStudio(rid, state.design.revision, {
        background_color: draft.background,
        foreground_color: draft.foreground,
        hide_restaurant_name: draft.hideRestaurantName,
        logo_png: draft.logo?.split(',')[1] ?? null,
        banner_png: draft.banner?.split(',')[1] ?? null,
        banner_original: draft.original && draft.original !== saved?.original ? draft.original.split(',')[1] : undefined,
        banner_layout: draft.layout ?? undefined,
        ...renders,
      }, signal);
      if (signal.aborted) return;
      setState({ ...state, design });
      setDraft(fromDesign(design));
      setWebsiteImport(null);
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

  function publish() {
    if (!state || !canPublish) return;
    void perform('publish', async (signal) => {
      const revision = await publishWalletStudio(rid, state.design.revision, signal);
      if (signal.aborted) return;
      setState({ ...state, published_revision: revision });
      setMessage('walletStudioPublishedMessage');
    });
  }

  async function copyCustomerLink() {
    try {
      await navigator.clipboard.writeText(customerPage);
      setMessage('copied');
    } catch {
      setMessage('walletStudioCopyFailed');
    }
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
                  {state.can_edit && <div className="space-y-2 border-b border-[var(--line)] pb-5">
                    <Button type="button" variant="secondary" onClick={generateFromWebsite} aria-busy={action === 'website'} aria-describedby="wallet-website-help">
                      {action === 'website' ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                      {t(action === 'website' ? 'walletStudioWebsiteWorking' : 'generateWithAi')}
                    </Button>
                    <p id="wallet-website-help" className="text-sm text-[var(--fg-muted)]">{t('walletStudioWebsiteHelp')}</p>
                    {websiteImport && <div className="space-y-1">
                      <p className="text-sm" role="status">{t('walletStudioWebsiteApplied')} {websiteImport.parts.map(key => t(key)).join(' · ')}.
                        {websiteImport.partial && <> {t('walletStudioWebsitePartial')}</>}
                      </p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => change(websiteImport.before)}>
                        <Undo2 size={15} aria-hidden="true" />{t('walletStudioWebsiteUndo')}
                      </Button>
                    </div>}
                  </div>}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t('earnPresets')}</legend>
                    <div className="grid grid-cols-3 gap-2">{palettes.map(p=><button key={p.label} type="button"
                      aria-pressed={draft.background.toUpperCase()===p.background && draft.foreground.toUpperCase()===p.foreground}
                      onClick={()=>change({background:p.background, foreground:p.foreground})}
                      style={{backgroundColor:p.background,color:p.foreground}}
                      className="min-w-0 rounded-lg border border-black/10 p-3 text-start text-sm font-semibold focus-visible:outline-2 aria-pressed:ring-2 aria-pressed:ring-[var(--fg)]">
                      {t(p.label)}</button>)}</div>
                  </fieldset>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField id="wallet-background" label={t('walletStudioBackground')} value={draft.background}
                      fallback={state.design.background_color} onChange={background => change({ background })} />
                    <ColorField id="wallet-foreground" label={t('walletStudioForeground')} value={draft.foreground}
                      fallback={state.design.foreground_color} onChange={foreground => change({ foreground })} />
                  </div>
                  <p className="text-xs text-[var(--fg-muted)]">{t('walletStudioAppleText')}</p>
                  <div className="space-y-3 border-t border-[var(--line)] pt-4">
                    <AssetField id="wallet-logo" label={t('walletStudioLogo')} image={draft.logo}
                      error={imageError?.slot === 'logo' ? t(imageError.key) : undefined}
                      onPick={file => pick('logo', file)} onRemove={() => change({ logo: null })} />
                    <div className="flex items-center justify-between gap-3 py-1">
                      <label htmlFor="wallet-show-name" className="text-sm font-medium">{t('walletStudioShowRestaurantName')}</label>
                      <BooleanInput id="wallet-show-name" checked={!draft.hideRestaurantName}
                        onChange={event => change({ hideRestaurantName: !event.target.checked })} />
                    </div>
                    <AssetField id="wallet-banner" label={t('walletStudioBanner')} image={draft.banner}
                      error={imageError?.slot === 'banner' ? t(imageError.key) : undefined}
                      onPick={file => pick('banner', file)} onRemove={() => { setFraming(false); change({ banner: null, original: null, layout: null }); }} />
                    {draft.banner && <>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">{t('earnLayouts')}</legend>
                        <div className="grid grid-cols-3 gap-2">
                          {templates.map(template => <button key={template.name} type="button"
                            aria-pressed={sameBannerLayout(layout, template.layout)}
                            className="overflow-hidden rounded-lg border border-[var(--line)] text-start focus-visible:outline-2 aria-pressed:ring-2 aria-pressed:ring-[var(--fg)]"
                            onClick={() => change({layout:structuredClone(template.layout)})}>
                            <span aria-hidden="true" className="relative block h-14" style={{backgroundColor: isColor(draft.background) ? draft.background : state.design.background_color}}>
                              <Image unoptimized fill alt="" src={draft.original ?? draft.banner!} style={{objectFit:template.layout.shared.fit}} />
                              {template.layout.apple_counter === 'overlay' && <span className="absolute start-2 bottom-1 font-bold" style={{color:isColor(draft.foreground) ? draft.foreground : state.design.foreground_color}}>8</span>}
                            </span>
                            <span className="block px-2 py-2 text-xs font-medium">{t(template.name)}</span>
                          </button>)}
                        </div>
                      </fieldset>
                      <Button type="button" variant="secondary" aria-expanded={framing} aria-controls="wallet-frame-controls" onClick={() => setFraming(!framing)}>
                        <Crop size={16} aria-hidden="true" />{t('walletFrameTitle')}
                      </Button>
                      {framing && <WalletBannerControls layout={layout} platform={platform} onPlatform={setPlatform}
                        onChange={next => change({ layout: next })} onFrame={adjustFrame} />}
                    </>}
                    <p className="text-xs text-[var(--fg-muted)]">{t('walletStudioImageHint')}</p>
                  </div>
                  {state.can_edit && <Button disabled={!canSave} onClick={save}>{t('walletStudioSave')}</Button>}
                </fieldset>
                {!state.can_edit && <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('walletStudioReadOnly')}</p>}
              </CardBody>
            </Card>
            {publishedRevision !== undefined && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('walletStudioPublication')}</CardTitle>
                  <Badge tone={publishedRevision > 0 ? 'success' : 'neutral'}>
                    {t(publicationStatus)}
                  </Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-sm text-[var(--fg-muted)]">
                    {t(!state.program ? 'walletStudioPublishNeedsProgram' : dirty || !state.design.revision ? 'walletStudioPublishSave' : 'walletStudioCustomerCardHelp')}
                  </p>
                  {state.program?.enabled === false && (
                    <p className="text-sm text-[var(--fg-muted)]">{t('walletStudioActiveRequired')}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {state.can_edit && (
                      <Button variant="secondary" disabled={!canPublish || !!action} onClick={publish}>
                        {t(action === 'publish' ? 'walletStudioPublishing' : 'walletStudioPublish')}
                      </Button>
                    )}
                    {state.program && (
                      <>
                        <Button variant="ghost" onClick={copyCustomerLink} disabled={!!action}>{t('walletStudioCopyLink')}</Button>
                        <Button variant="ghost" asChild>
                          <a href={customerPage} target="_blank" rel="noopener noreferrer">
                            {t('walletStudioOpenCustomerPage')}
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </CardBody>
              </Card>
            )}
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
                <Tabs value={platform} onValueChange={value => setPlatform(value as WalletPlatform)}>
                  <TabsList aria-label={t('walletStudioPreview')} className="mx-auto max-w-full">
                    <Tab value="apple">Apple Wallet</Tab>
                    <Tab value="google">Google Wallet</Tab>
                  </TabsList>
                  {(['apple', 'google'] as const).map(wallet => <TabsContent key={wallet} value={wallet}><Preview platform={wallet} state={state} draft={draft} sample={sample}
                    onFrame={framing && state.can_edit && !action && !stale ? adjustFrame : undefined} /></TabsContent>)}
                </Tabs>
                <label className="mx-auto mt-4 flex max-w-sm items-center gap-2 text-sm">
                  {t('earnSample')}<input className="min-w-0 flex-1" type="range" min="0" max={Math.max(0,(state.program?.threshold??2)-1)} value={Math.min(sample,(state.program?.threshold??2)-1)} onChange={ev=>setSample(Number(ev.target.value))}/>
                  <output className="tabular-nums">{Math.min(sample,(state.program?.threshold??2)-1)}</output>
                </label>
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

function AssetField({ id, label, image, error, onPick, onRemove }: {
  id: string; label: string; image: string | null; error?: string; onPick: (file: File) => void; onRemove: () => void;
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
        <input className="sr-only" id={id} aria-label={label} aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined}
          type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={e => {
          const file = e.currentTarget.files?.[0];
          if (file) onPick(file);
          e.currentTarget.value = '';
        }} />
      </label>
      {image && <Button variant="ghost" size="sm" aria-label={`${t('walletStudioRemove')} ${label}`} onClick={onRemove}>{t('walletStudioRemove')}</Button>}
      {error && <p id={id + '-error'} role="alert" className="w-full text-sm text-[var(--danger-500)]">{error}</p>}
    </div>
  );
}

function Preview({ platform, state, draft, sample, onFrame }: { sample:number; platform: WalletPlatform; state: WalletStudioState; draft: Draft; onFrame?: (f: ImageFrame) => void }) {
  const { t, locale } = useI18n();
  const apple = platform === 'apple';
  const background = isColor(draft.background) ? draft.background : state.design.background_color;
  const text = isColor(draft.foreground) ? draft.foreground : state.design.foreground_color;
  const rgb = [1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16));
  const googleText = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? '#202124' : '#FFFFFF';
  const title = state.program?.names[locale] || t('loyaltyProgramTitle');
  const unit = t(state.program?.mode === 'points' ? 'loyaltyProgramPoints' : 'loyaltyProgramVisits');
  const threshold = state.program?.threshold ?? 2;
  const progress = Math.min(sample, threshold - 1);
  const counterBelow = apple && !!draft.banner && draft.layout?.apple_counter === 'below';
  const progressFields = (
    <div data-wallet-counter>
      <div className="text-xs font-medium">{unit}</div>
      <div className={(counterBelow ? 'text-lg' : 'text-[2rem]') + ' font-semibold leading-tight tabular-nums'}>{progress}</div>
    </div>
  );
  const banner = (draft.original ?? draft.banner);
  const frame = draft.layout ?? legacyLayout;
  const overlay = apple && !counterBelow && <div className="pointer-events-none absolute inset-0 px-4 py-3">{progressFields}</div>;
  const bannerElement = banner && <FramedWalletBanner source={banner} platform={platform} legacy={!draft.layout}
    frame={walletFrame(frame, platform)} onFrame={onFrame}>{overlay}</FramedWalletBanner>;
  return (
    <div data-wallet-preview={platform} className="mx-auto max-w-[23rem] overflow-hidden rounded-[1.35rem] border border-black/10 shadow-2"
      style={{ backgroundColor: background, color: apple ? text : googleText }}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-2">
          {(draft.logo || !apple) && (
            <Image unoptimized src={draft.logo ?? '/brand/foody-symbol.svg'} alt={t('walletStudioLogo')} width={apple ? 160 : 36} height={36}
              className={apple ? 'h-9 w-auto max-w-[10rem] object-contain' : 'h-9 w-9 rounded-full bg-white p-0.5 object-contain'} />
          )}
          <div className="min-w-0 break-words text-sm font-semibold leading-tight">
            {!apple && <div className="text-xs font-normal">Foody</div>}
            {apple ? (!draft.hideRestaurantName && state.restaurant_name) : title}
          </div>
        </div>
        {apple && <span className="max-w-[45%] text-end text-xs font-medium">{t('walletStudioTestCard')}</span>}
      </div>
      {apple && bannerElement ? bannerElement : <div className="px-4 pb-2">{progressFields}</div>}
      <div className={(counterBelow ? 'grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)]' : 'flex flex-wrap justify-between') + ' gap-3 px-4 py-3 text-xs'}>
        {counterBelow && progressFields}
        {apple && <span className="break-words font-medium">{title}</span>}
        <span>{t('walletStudioThreshold')} <b className={counterBelow ? 'block text-lg leading-tight tabular-nums' : 'tabular-nums'}>{threshold}</b></span>
      </div>
      {!apple && bannerElement}
      <div className="flex flex-col items-center gap-2 p-4">
        <div className="rounded-lg bg-white p-2" aria-hidden="true"><QRCodeSVG value={testBarcode} size={90} marginSize={1} /></div>
        <a className="text-[11px] hover:underline focus-visible:underline" href="https://foody-pos.co.il/?utm_source=wallet&utm_medium=powered_by"
          target="_blank" rel="noopener noreferrer">{t('walletStudioAttribution')}</a>
      </div>
    </div>
  );
}
