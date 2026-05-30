'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutConfig } from '@/lib/api';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

interface CheckoutPreviewIframeProps {
  slug?: string;
  mode: 'mobile' | 'desktop';
  orderType: 'delivery' | 'pickup';
  checkoutConfig: CheckoutConfig | null;
  googlePlacesApiKey?: string;
}

/**
 * CheckoutPreviewIframe embeds the foodyweb checkout page in preview mode and
 * streams the draft CheckoutConfig in over postMessage so the owner sees their
 * unsaved changes immediately. The iframe URL stays stable across edits — only
 * the postMessage payload updates — so we never lose form state or re-flash.
 *
 * On the foodyweb side, see app/order/checkout/page.tsx — `?preview=1` skips
 * the cart-empty redirect and registers a window message listener that
 * overrides restaurant.checkoutConfig with whatever we post here.
 */
export default function CheckoutPreviewIframe({
  slug, mode, orderType, checkoutConfig, googlePlacesApiKey,
}: CheckoutPreviewIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // foodyweb posts {type:'foody-checkout-preview-ready'} when it has mounted
  // and is ready to receive config updates. Until then we hold off sending.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'foody-checkout-preview-ready') setReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendConfig = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'foody-checkout-preview',
      checkoutConfig,
      googlePlacesApiKey: googlePlacesApiKey ?? '',
    }, '*');
  }, [checkoutConfig, googlePlacesApiKey]);

  // Push fresh config any time the owner edits something.
  useEffect(() => {
    if (!ready) return;
    sendConfig();
  }, [ready, sendConfig]);

  // Reset readiness when the URL changes (different slug or order type → the
  // iframe reloads and must re-announce itself).
  useEffect(() => {
    setReady(false);
  }, [slug, orderType]);

  if (!slug) {
    return (
      <div className="flex items-center justify-center h-full text-fg-secondary text-sm">
        Sauvegardez le slug du restaurant pour voir l&apos;aperçu.
      </div>
    );
  }

  const src = `${WEB_URL}/r/${encodeURIComponent(slug)}/order/checkout?orderType=${orderType}&preview=1&restaurantId=${encodeURIComponent(slug)}`;
  const width = mode === 'mobile' ? 412 : 1024;
  const height = mode === 'mobile' ? 850 : 720;

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: 'var(--surface)',
      }}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title="Aperçu de la commande"
        className="w-full h-full border-0"
        onLoad={() => {
          // Some browsers fire load before the inner script wires its listener.
          // If we already got the ready handshake, this is a refresh — re-send.
          if (ready) sendConfig();
        }}
      />
    </div>
  );
}
