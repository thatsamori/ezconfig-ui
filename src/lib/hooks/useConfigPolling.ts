'use client';

import { useEffect, useState } from 'react';
import { CONFIG_POLL_INTERVAL_MS, createConfigSync, type ConfigSyncStatus } from '@/lib/store/configSync';

export function useConfigPolling(reload: number) {
  const [status, setStatus] = useState<ConfigSyncStatus>({ savedAt: null, loading: true, error: '' });
  useEffect(() => {
    const sync = createConfigSync({
      canApply: () => document.visibilityState === 'visible',
      editingField: () => {
        const active = document.activeElement;
        if (!active?.matches('input, textarea, [contenteditable="true"]')) return null;
        const cell = active.closest<HTMLElement>('[data-config-category]');
        return cell ? { database: cell.dataset.configDatabase!, category: cell.dataset.configCategory!, key: cell.dataset.configKey! } : null;
      },
      onStatus: setStatus,
    });
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let checking = false;
    const check = async () => {
      if (checking || stopped) return;
      checking = true;
      clearTimeout(timer);
      if (document.visibilityState === 'visible') await sync.poll();
      checking = false;
      if (!stopped) timer = setTimeout(check, CONFIG_POLL_INTERVAL_MS);
    };
    const resume = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      sync.dispose();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [reload]);
  return status;
}
