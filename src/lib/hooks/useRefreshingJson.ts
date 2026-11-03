'use client';

import { useCallback, useEffect, useState } from 'react';

export const REFRESH_INTERVAL_MS = 2_000;

type Loaded<T> = { url: string; data?: T; error: string };

/**
 * GETs a platform route's `{ success, data }` now and about every 2 s while
 * the page is visible, and at once when it is shown again. The last data stays
 * while a refresh fails, with the error beside it. `refresh()` checks at once.
 */
export function useRefreshingJson<T>(url: string, intervalMs = REFRESH_INTERVAL_MS) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ url, error: '' });
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let checking = false;
    const keep = (next: (previous: Loaded<T>) => Loaded<T>) => { if (!stopped) setLoaded(previous => next(previous.url === url ? previous : { url, error: '' })); };
    const check = async () => {
      if (checking || stopped) return;
      checking = true;
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          const body = await response.json().catch(() => ({})) as { success?: boolean; data?: T; error?: string };
          keep(previous => response.ok && body.success ? { url, data: body.data, error: '' } : { ...previous, error: body.error || `Could not load (${response.status})` });
        } catch {
          keep(previous => ({ ...previous, error: 'Could not reach the platform' }));
        }
      }
      checking = false;
      if (!stopped) timer = setTimeout(check, intervalMs);
    };
    const resume = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [url, intervalMs, nudge]);
  const refresh = useCallback(() => setNudge(n => n + 1), []);
  const current = loaded.url === url ? loaded : { data: undefined, error: '' };
  return { data: current.data, error: current.error, refresh };
}
