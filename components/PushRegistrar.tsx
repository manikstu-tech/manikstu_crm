'use client';

import { useEffect } from 'react';

type SamarthApp = { platform?: string; pushToken?: string | null };
declare global {
  interface Window {
    SamarthApp?: SamarthApp;
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

/**
 * Inside the Samarth Android app, saves this phone's push token for whoever is signed in,
 * so the backend can send them notifications. Does nothing in an ordinary browser.
 * Runs on every full page load (signing in is one), so switching users on a phone moves the token.
 */
export default function PushRegistrar() {
  useEffect(() => {
    if (location.pathname.startsWith('/login')) return;
    let sent: string | null = null;

    const register = (app?: SamarthApp) => {
      const token = app?.pushToken;
      if (!token || token === sent) return;
      sent = token;
      fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: app?.platform }),
      }).catch(() => { sent = null; });
    };

    const onToken = (e: Event) => register((e as CustomEvent<SamarthApp>).detail);
    window.addEventListener('samarth:push-token', onToken);
    register(window.SamarthApp);
    // The app may not have handed the token over yet: ask for it.
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'samarth:get-push-token' }));
    return () => window.removeEventListener('samarth:push-token', onToken);
  }, []);

  return null;
}
