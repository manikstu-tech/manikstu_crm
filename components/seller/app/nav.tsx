'use client';

// In-app navigation for the seller app.
//
// Every seller screen is served by one route (app/seller/[[...slug]]), so moving between screens
// only changes the URL with the History API: it is instant, keeps the data already on screen, and
// still works with no connection. Next.js keeps usePathname / useSearchParams in step with
// pushState, and restores these entries on back / forward without asking the server.
//
// Bottom sheets add their own history entry, so the phone's back button closes the sheet instead
// of leaving the screen.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { BACK_FALLBACK, SCREEN_TITLE, SellerRoute, parseSellerPath } from './routes';

interface HistoryMarks {
  sxIdx?: string;
  sxDepth?: number;
  sxSheet?: string;
}

const state = (): HistoryMarks => (typeof window === 'undefined' ? {} : ((window.history.state ?? {}) as HistoryMarks));
/**
 * Only our own keys. Passing Next's internal markers (__NA, its tree) back into pushState / replaceState
 * makes Next treat the call as its own and skip updating usePathname / useSearchParams; it copies them itself.
 */
const ownMarks = (): HistoryMarks => {
  const s = state();
  return { sxIdx: s.sxIdx, sxDepth: s.sxDepth };
};
const newIdx = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Pending history.back() calls we started ourselves, and what to do once they land.
let awaitingPop = 0;
let afterPop: (() => void) | null = null;
const scrollPositions = new Map<string, number>();

function goBackThen(fn: (() => void) | null) {
  afterPop = fn;
  awaitingPop += 1;
  window.history.back();
}

interface NavValue {
  route: SellerRoute;
  pathname: string;
  query: URLSearchParams;
  /** Open a seller screen (or leave the app for any other URL). */
  navigate: (href: string, opts?: { replace?: boolean }) => void;
  /** Back to the previous screen, or this screen's parent when it was opened directly. */
  back: () => void;
  /** Change the current URL's query (filters, tabs) without adding a history entry. */
  setQuery: (patch: Record<string, string | null | undefined>) => void;
}

const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav must be used inside <SellerNavProvider>');
  return v;
}

export function SellerNavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/seller';
  const search = useSearchParams();
  const route = useMemo<SellerRoute>(() => parseSellerPath(pathname) ?? { screen: 'home' }, [pathname]);
  const currentIdx = useRef<string | undefined>(undefined);

  // Mark the entry we arrived on, and take over scroll restoration (the browser's would jump before the screen renders).
  useEffect(() => {
    const s = state();
    if (!s.sxIdx) window.history.replaceState({ ...window.history.state, sxIdx: newIdx(), sxDepth: 0 }, '');
    currentIdx.current = state().sxIdx;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const onPop = () => {
      const s2 = state();
      if (awaitingPop > 0) {
        awaitingPop -= 1;
        if (awaitingPop === 0 && afterPop) {
          const fn = afterPop;
          afterPop = null;
          fn();
          return;
        }
      }
      // Same entry (a sheet closing): nothing to restore.
      if (!s2.sxIdx || s2.sxIdx === currentIdx.current) return;
      currentIdx.current = s2.sxIdx;
      const y = scrollPositions.get(s2.sxIdx) ?? 0;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.history.scrollRestoration = prev;
    };
  }, []);

  useEffect(() => {
    document.title = route.screen === 'home' ? 'Manikstu Seller' : `${SCREEN_TITLE[route.screen]} · Manikstu Seller`;
  }, [route.screen]);

  const go = useCallback((href: string, replace: boolean) => {
    const s = state();
    if (s.sxIdx) scrollPositions.set(s.sxIdx, window.scrollY);
    const idx = newIdx();
    const marks: HistoryMarks = { sxIdx: idx, sxDepth: replace ? s.sxDepth ?? 0 : (s.sxDepth ?? 0) + 1 };
    if (replace) window.history.replaceState({ ...ownMarks(), ...marks }, '', href);
    else window.history.pushState(marks, '', href);
    currentIdx.current = idx;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, []);

  const navigate = useCallback((href: string, opts: { replace?: boolean } = {}) => {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !parseSellerPath(url.pathname)) {
      window.location.assign(url.toString());
      return;
    }
    const target = `${url.pathname}${url.search}${url.hash}`;
    const run = () => go(target, !!opts.replace);
    // A sheet is open (its entry is on top) or is closing: let that settle, then move.
    if (awaitingPop > 0) { afterPop = run; return; }
    if (state().sxSheet) { goBackThen(run); return; }
    run();
  }, [go]);

  const back = useCallback(() => {
    if ((state().sxDepth ?? 0) > 0) window.history.back();
    else navigate(BACK_FALLBACK[route.screen] ?? '/seller', { replace: true });
  }, [navigate, route.screen]);

  const setQuery = useCallback((patch: Record<string, string | null | undefined>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(ownMarks(), '', `${url.pathname}${url.search}`);
  }, []);

  const query = useMemo(() => new URLSearchParams(search?.toString() ?? ''), [search]);
  const value = useMemo<NavValue>(() => ({ route, pathname, query, navigate, back, setQuery }), [route, pathname, query, navigate, back, setQuery]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

/** A link to a seller screen: a real href (open in new tab still works) with in-app navigation on a plain tap. */
export function AppLink({ href, replace, onClick, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean }) {
  const { navigate } = useNav();
  return (
    <a
      href={href}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * Gives an open sheet its own history entry: the back button (or back gesture) closes the sheet.
 * Closing it any other way removes that entry again.
 */
export function useSheetHistory(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = newIdx();
    let pushed = false;
    let closedByBack = false;
    let cancelled = false;
    const onPop = () => {
      if (pushed && state().sxSheet !== id) {
        closedByBack = true;
        onCloseRef.current();
      }
    };
    const push = () => {
      if (cancelled) return;
      window.history.pushState({ ...window.history.state, sxSheet: id }, '');
      pushed = true;
      window.addEventListener('popstate', onPop);
    };
    // Another sheet is still taking its entry off (closed in the same tap): add ours after that.
    if (awaitingPop > 0) {
      const prev = afterPop;
      afterPop = () => { prev?.(); push(); };
    } else {
      push();
    }
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', onPop);
      if (pushed && !closedByBack && awaitingPop === 0 && state().sxSheet === id) goBackThen(null);
    };
  }, [open]);
}
