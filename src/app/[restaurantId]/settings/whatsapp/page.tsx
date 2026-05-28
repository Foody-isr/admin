'use client';

/**
 * WhatsApp Business — settings sub-page.
 * Connects the restaurant's own WhatsApp number via Meta Embedded Signup (Tech Provider),
 * registers it as a Twilio sender, and polls until the sender is ONLINE.
 *
 * Note: copy on this page is English-only for now (newer admin section).
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getWhatsAppSender,
  connectWhatsApp,
  disconnectWhatsApp,
  WhatsAppSender,
} from '@/lib/api';
import { Badge, Button, Field, Input, PageHead, Section } from '@/components/ds';

const FB_SDK_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
const WA_CONFIG_ID = process.env.NEXT_PUBLIC_WA_CONFIG_ID || '';
const SOLUTION_ID = process.env.NEXT_PUBLIC_TWILIO_SOLUTION_ID || '';

interface FacebookSDK {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit?: () => void;
  }
}

export default function WhatsAppSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [sender, setSender] = useState<WhatsAppSender | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Embedded Signup outputs awaiting the owner's phone-number confirmation.
  const [pending, setPending] = useState<{ waba_id: string; phone_number_id: string } | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Load the Facebook SDK once.
  useEffect(() => {
    if (typeof window === 'undefined' || window.FB || !META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: FB_SDK_VERSION });
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, []);

  // Listen for Embedded Signup completion messages.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          const wabaId = data?.data?.waba_id;
          const phoneNumberId = data?.data?.phone_number_id;
          if (wabaId && phoneNumberId) {
            setPending({ waba_id: wabaId, phone_number_id: phoneNumberId });
          }
        }
      } catch {
        /* non-JSON messages from other facebook frames — ignore */
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const refresh = useCallback(() => {
    getWhatsAppSender(rid)
      .then(setSender)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while a sender is mid-provisioning.
  useEffect(() => {
    if (!sender) return;
    if (sender.status === 'ONLINE' || sender.status === 'OFFLINE' || sender.status === 'FAILED') return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [sender, refresh]);

  const launchSignup = () => {
    setError(null);
    if (!window.FB) {
      setError('Facebook SDK not loaded yet. Please retry in a moment.');
      return;
    }
    window.FB.login(
      () => {
        /* The authorization code is consumed by Twilio's partner solution; we rely on the
           WA_EMBEDDED_SIGNUP message event to capture waba_id + phone_number_id. */
      },
      {
        config_id: WA_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: { solutionID: SOLUTION_ID }, sessionInfoVersion: 3 },
      },
    );
  };

  const submitConnect = async () => {
    if (!pending || !phoneNumber || !displayName) return;
    setConnecting(true);
    setError(null);
    try {
      const row = await connectWhatsApp(rid, {
        waba_id: pending.waba_id,
        phone_number_id: pending.phone_number_id,
        phone_number: phoneNumber,
        display_name: displayName,
      });
      setSender(row);
      setPending(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectWhatsApp(rid);
    setSender(null);
  };

  return (
    <div>
      <PageHead title="WhatsApp Business" desc="Send order notifications from your own WhatsApp number." />

      <Section title="Connection">
        {loading ? (
          <p>Loading...</p>
        ) : sender ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{sender.display_name || sender.sender_number}</div>
              <div className="text-fs-sm opacity-70">{sender.sender_number}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={sender.status === 'ONLINE' ? 'success' : sender.status === 'FAILED' ? 'danger' : 'warning'}>
                {sender.status}
              </Badge>
              <Button variant="ghost" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-col gap-3">
            <p className="text-fs-sm opacity-80">
              Confirm the WhatsApp number you just connected (international format, e.g. +972501234567) and the display
              name customers will see.
            </p>
            <Field label="Phone number">
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+972501234567" />
            </Field>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Chez Foody" />
            </Field>
            <div>
              <Button onClick={submitConnect} disabled={connecting || !phoneNumber || !displayName}>
                {connecting ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-fs-sm opacity-80">
              Connect your own WhatsApp Business number so order notifications are sent from your brand. Foody works with
              Twilio to enable your business on WhatsApp.
            </p>
            <div>
              <Button onClick={launchSignup} disabled={!META_APP_ID || !WA_CONFIG_ID}>
                Connect WhatsApp
              </Button>
            </div>
            {(!META_APP_ID || !WA_CONFIG_ID) && (
              <p className="text-fs-sm text-[var(--danger-500)]">
                WhatsApp onboarding is not configured yet (missing Meta app or config ID).
              </p>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-fs-sm text-[var(--danger-500)]">{error}</p>}
      </Section>
    </div>
  );
}
