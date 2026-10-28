'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WebEnquiry } from '../data/managerDashboard';
import { EnquiryPatch, TrackerAction, TrackerState, enquiriesOf } from './trackerOps';

// Keeps a dashboard's copy of the shared telecalling data in step with the server:
// checks for changes every few seconds (and when the tab comes back into view), and sends changes.

const POLL_MS = 5000;

/** What a file import saved: leads created (how many without a name) and rows skipped as already leads. */
export interface ImportSummary {
  imported: number;
  name_missing: number;
  duplicates: { row: number; message: string }[];
  /** Rows the server refused, with the reason (the preview should already have caught them). */
  failed?: { row: number; message: string }[];
}

export interface TrackerSync {
  data: TrackerState;
  /** Send a change; resolves with the server's message and any new lead ids, or rejects with a readable error. */
  run: (action: TrackerAction) => Promise<{ message: string; createdIds: number[]; summary?: ImportSummary | null }>;
  /** When the data was last confirmed up to date. */
  syncedAt: Date | null;
  offline: boolean;
}

export function useTracker(initial: TrackerState): TrackerSync {
  const [data, setData] = useState(initial);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const version = useRef(initial.version);
  /** Goes up whenever a change starts or finishes saving. */
  const saves = useRef(0);

  /**
   * Ignore a slower, older response arriving after a newer one. A refresh that didn't overlap any save
   * is the server's current data, so it's taken even if older (the shared data was reset).
   */
  const accept = useCallback((state: TrackerState, cleanRefresh = false) => {
    if (state.version < version.current && !cleanRefresh) return;
    version.current = state.version;
    setData(state);
  }, []);

  const refresh = useCallback(async () => {
    const savesAtStart = saves.current;
    try {
      const res = await fetch(`/api/tracker?since=${version.current}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (body.state) accept(body.state, saves.current === savesAtStart);
      setSyncedAt(new Date());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [accept]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  const run = useCallback(async (action: TrackerAction) => {
    let res: Response;
    saves.current++;
    try {
      res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      saves.current++;
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    saves.current++;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Could not save the change. Please try again.');
    accept(body.state);
    setSyncedAt(new Date());
    setOffline(false);
    return { message: body.message as string, createdIds: (body.createdIds ?? []) as number[], summary: (body.summary ?? null) as ImportSummary | null };
  }, [accept]);

  return { data, run, syncedAt, offline };
}

const ENQUIRY_FIELDS = ['status', 'admin_notes', 'replied_at', 'lead_id'] as const;

/**
 * Shared website enquiries as [list, setter], shaped like useState so the Enquiries page works
 * unchanged. The setter shows the change straight away and saves only the changed fields; if saving
 * fails, the list goes back to the server's version and onError gets the message.
 */
export function useSharedEnquiries(sync: TrackerSync, onError: (message: string) => void): [WebEnquiry[], Dispatch<SetStateAction<WebEnquiry[]>>] {
  const server = enquiriesOf(sync.data);
  const [pending, setPending] = useState<WebEnquiry[] | null>(null);
  const shown = pending ?? server;
  const latest = useRef(shown);
  latest.current = shown;
  const inFlight = useRef(0);

  const { run } = sync;
  const setEnquiries = useCallback<Dispatch<SetStateAction<WebEnquiry[]>>>(update => {
    const before = latest.current;
    const next = typeof update === 'function' ? update(before) : update;
    const changes: { id: number; patch: EnquiryPatch }[] = [];
    next.forEach(e => {
      const old = before.find(x => x.id === e.id);
      if (!old) return;
      const patch: EnquiryPatch = {};
      ENQUIRY_FIELDS.forEach(k => { if (e[k] !== old[k]) (patch as Record<string, unknown>)[k] = e[k]; });
      if (Object.keys(patch).length) changes.push({ id: e.id, patch });
    });
    if (changes.length === 0) return;
    latest.current = next;
    setPending(next);
    inFlight.current++;
    run({ type: 'update-enquiries', changes })
      .then(() => { if (--inFlight.current === 0) setPending(null); })
      .catch(err => { inFlight.current--; setPending(null); onError((err as Error).message); });
  }, [run, onError]);

  return [shown, setEnquiries];
}
