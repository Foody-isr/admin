/** Browser API shared by the Instagram and WhatsApp connection flows. */
export interface FacebookSDK {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void;
  getLoginStatus: (callback: (response: unknown) => void, roundtrip?: boolean) => void;
}
declare global { interface Window { FB?: FacebookSDK; fbAsyncInit?: () => void } }
const loads = new Map<string, Promise<FacebookSDK>>();

/** Load the existing Meta SDK once per configuration, with a recoverable timeout. */
export function loadMetaSdk(appId: string, version: string): Promise<FacebookSDK> {
  const initialize = () => {
    if (!window.FB) throw new Error('Meta SDK unavailable');
    window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
    return window.FB;
  };
  if (window.FB) return Promise.resolve().then(initialize);
  const key = `${appId}:${version}`, pending = loads.get(key);
  if (pending) return pending;
  const promise = new Promise<FacebookSDK>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://connect.facebook.net/en_US/sdk.js"]');
    const script = existing || document.createElement('script'), previous = window.fbAsyncInit;
    const cleanup = () => { clearTimeout(timeout); script.removeEventListener('error', failed); if (window.fbAsyncInit === initialized) window.fbAsyncInit = previous; };
    const failed = () => { cleanup(); if (!existing) script.remove(); reject(new Error('Meta SDK unavailable')); };
    const initialized = () => { cleanup(); try { previous?.(); resolve(initialize()); } catch (cause) { reject(cause); } };
    const timeout = setTimeout(failed, 15000);
    window.fbAsyncInit = initialized; script.addEventListener('error', failed);
    if (!existing) { script.src = 'https://connect.facebook.net/en_US/sdk.js'; script.async = true; script.defer = true; script.crossOrigin = 'anonymous'; document.body.appendChild(script); }
  }).catch(cause => { loads.delete(key); throw cause; });
  loads.set(key, promise); return promise;
}
