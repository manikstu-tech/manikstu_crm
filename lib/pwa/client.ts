'use client';

// Browser-side helpers for the installable seller app: connection status, screen size,
// the install prompt and the service worker.

import { useSyncExternalStore } from 'react';

/* ---------- Online / offline ---------- */

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** True while the device reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/* ---------- Media queries ---------- */

/** Matches a CSS media query. `serverGuess` is used for the server render and hydration. */
export function useMediaQuery(query: string, serverGuess = false): boolean {
  return useSyncExternalStore(
    cb => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => serverGuess,
  );
}

/** Below this width the seller app uses the phone / tablet layout with bottom navigation. */
export const MOBILE_QUERY = '(max-width: 1023.98px)';

/* ---------- Install prompt ---------- */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach(l => l());

// Chrome fires this once, possibly before React has mounted anything, so listen at load.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    notifyInstall();
  });
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallState {
  /** Running as the installed app (home-screen icon). */
  standalone: boolean;
  /** The browser offered an install prompt we can show. */
  canPrompt: boolean;
  /** iPhone / iPad Safari: no prompt, the seller adds it from the Share menu. */
  platform: InstallPlatform;
  installed: boolean;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const platformOf = (): InstallPlatform => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};

let installSnapshot: InstallState | null = null;
const SERVER_INSTALL: InstallState = { standalone: false, canPrompt: false, platform: 'desktop', installed: false };

function readInstall(): InstallState {
  const next: InstallState = { standalone: isStandalone(), canPrompt: !!deferredPrompt, platform: platformOf(), installed: installedNow || isStandalone() };
  if (
    !installSnapshot ||
    installSnapshot.standalone !== next.standalone ||
    installSnapshot.canPrompt !== next.canPrompt ||
    installSnapshot.platform !== next.platform ||
    installSnapshot.installed !== next.installed
  ) {
    installSnapshot = next;
  }
  return installSnapshot;
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    cb => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    readInstall,
    () => SERVER_INSTALL,
  );
}

/** Show the browser's install dialog. Resolves true when the seller accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const evt = deferredPrompt;
  deferredPrompt = null;
  notifyInstall();
  await evt.prompt();
  const choice = await evt.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  return choice.outcome === 'accepted';
}

/* ---------- Service worker ---------- */

/**
 * Registers /sw.js. Only in production builds: the dev server's script files are not
 * versioned, so caching them would serve stale code. Set NEXT_PUBLIC_ENABLE_SW=1 to try it in dev.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const enabled = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === '1';
  if (!enabled) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* not fatal: the app works without offline support */
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Removes the app files kept for offline use. They are downloaded again on the next visit. */
export async function clearOfflineCache(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const keys = (await caches.keys()).filter(k => k.startsWith('manikstu-seller-'));
  await Promise.all(keys.map(k => caches.delete(k)));
  return keys.length;
}

/** Storage this site uses on the device, in bytes (null when the browser won't say). */
export async function storageUsed(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return typeof est?.usage === 'number' ? est.usage : null;
  } catch {
    return null;
  }
}
