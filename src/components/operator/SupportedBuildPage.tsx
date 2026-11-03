'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import type { SupportedBuild } from '@/lib/platform/supported-build';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];

/** "3 days ago", "1 hour ago", "just now". */
function ago(time: number): string {
  const elapsed = Math.max(0, Date.now() - time);
  const [unit, size] = UNITS.find(([, size]) => elapsed >= size) ?? [];
  return unit && size ? new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-Math.floor(elapsed / size), unit) : 'just now';
}

async function call(method = 'GET', stamp?: string): Promise<SupportedBuild | null> {
  const response = await fetch('/api/operator/supported-build', {
    method, cache: 'no-store',
    ...(stamp === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stamp }) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `The platform answered ${response.status}`);
  return (data as { supportedBuild: SupportedBuild | null }).supportedBuild;
}

/** The platform operator's Supported build: the one EZConfig build the platform sends configuration to, and setting it. */
export function SupportedBuildPage() {
  const [current, setCurrent] = useState<SupportedBuild | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [stamp, setStamp] = useState('');
  const [setting, setSetting] = useState(false);
  const [refusal, setRefusal] = useState('');

  const load = useCallback(async () => {
    try {
      setCurrent(await call());
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSetting(true);
    setRefusal('');
    try {
      const updated = await call('PUT', stamp);
      setCurrent(updated);
      setStamp('');
      toast.success(`Supported build is ${updated?.stamp}`);
    } catch (error) {
      setRefusal((error as Error).message);
    } finally {
      setSetting(false);
    }
  };

  return <div className="users-page supported-build-page">
    <div className="standalone-heading"><div><h1>Supported build</h1><p className="page-description">The platform sends configuration only to game servers running this EZConfig build. A game server on any other build gets nothing until it restarts onto this one, and its owner sees EZConfig needs updating. Publish the mod build first, then switch the Supported build together with any schema change.</p></div></div>
    {loadError ? <div className="empty-state" role="alert">{loadError} <button className="outline-button" onClick={() => void load()}>Retry</button></div>
      : current === undefined ? <p className="empty-state">Loading the Supported build…</p>
      : current === null ? <p className="supported-build-line">No Supported build is set, so nothing is sent to any game server.</p>
      : <p className="supported-build-line">Supported build <code>{current.stamp}</code>, set <time dateTime={new Date(current.setAt).toISOString()} title={new Date(current.setAt).toLocaleString()}>{ago(current.setAt)}</time> by {current.setBy ?? 'a former server owner'}</p>}
    <form className="register-server" onSubmit={submit}>
      <label htmlFor="supported-build-stamp" className="sr-only">Build stamp</label>
      <Input id="supported-build-stamp" value={stamp} onChange={event => setStamp(event.target.value)} placeholder="Build stamp, e.g. 20261102-153000" maxLength={32} autoComplete="off" spellCheck={false} aria-invalid={refusal ? true : undefined} />
      <button type="submit" className="primary-button" disabled={setting || !stamp.trim()}>{setting ? 'Setting…' : 'Set'}</button>
    </form>
    {refusal && <p className="form-error" role="alert">{refusal}</p>}
  </div>;
}
