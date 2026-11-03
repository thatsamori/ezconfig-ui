'use client';

import { useCallback, useEffect, useState } from 'react';
import { LIVE_STATE } from '@/components/game-servers/StatusBadges';
import type { PlatformStatus } from '@/lib/platform/status';

async function readStatus(): Promise<PlatformStatus> {
  const response = await fetch('/api/operator/status', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `The platform answered ${response.status}`);
  return data as PlatformStatus;
}

const when = (time: number | string) => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const iso = (time: number) => new Date(time).toISOString();
const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

const LIVE_STATES = ['pending', 'blocked', 'confirmed', 'failed'] as const;

/** How server owners are getting on across the platform: counts only, naming no game server or owner. */
export function ActivitySection({ activity: { serverOwners, liveConfigurations, gameServersApplied } }: { activity: PlatformStatus['activity'] }) {
  return <section className="status-section" aria-labelledby="status-activity">
    <h2 id="status-activity" className="preset-section-title">Activity</h2>
    <dl className="server-facts">
      <dt>Server owners</dt><dd><strong>{serverOwners.total}</strong> · <strong>{serverOwners.seenLast24h}</strong> seen in the last 24 h · <strong>{serverOwners.seenLast7Days}</strong> in the last 7 days</dd>
      <dt>Live configurations</dt><dd><ul className="status-states">{LIVE_STATES.map(state => <li key={state}><span className={`status-dot ${state}`} /><strong>{liveConfigurations[state]}</strong> {LIVE_STATE[state]}</li>)}</ul></dd>
      <dt>No Live configuration yet</dt><dd><strong>{liveConfigurations.none}</strong> {liveConfigurations.none === 1 ? 'game server' : 'game servers'}</dd>
      <dt>Game servers Applied</dt><dd><strong>{gameServersApplied.last24h}</strong> in the last 24 h · <strong>{gameServersApplied.last7Days}</strong> in the last 7 days</dd>
    </dl>
    <p className="status-muted status-activity-note">Server owners include you. Seen can run low: last seen is written at most once an hour, and signing out clears it. Game servers Applied counts game servers, not Applies: one Applied three times counts once.</p>
  </section>;
}

/** The platform operator's status page: game server counts, activity, health and backup, computed when it loads. */
export function StatusPage() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await readStatus());
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const warnings = status ? [status.backup.warning, status.restoreCheck.warning].filter((warning): warning is string => warning !== null) : [];

  return <div className="users-page status-page">
    <div className="standalone-heading"><div><h1>Status</h1><p className="page-description">What the platform is doing, as of when this page loaded{status && <> (<time dateTime={iso(status.now)}>{when(status.now)}</time>)</>}. It names no game server or owner.</p></div><button className="outline-button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {loadError ? <div className="empty-state" role="alert">{loadError} <button className="outline-button" onClick={() => void load()}>Retry</button></div>
      : status === null ? <p className="empty-state">Loading the status…</p>
      : <>
        {warnings.length > 0 && <section className="needs-updating status-warnings" role="alert"><h2>Needs attention</h2>{warnings.map(warning => <p key={warning}>{warning}</p>)}</section>}

        <section className="status-section" aria-labelledby="status-game-servers">
          <h2 id="status-game-servers" className="preset-section-title">Game servers</h2>
          <p className="status-line"><strong>{status.gameServers.registered}</strong> registered · <strong>{status.gameServers.connected}</strong> Connected now</p>
          {status.gameServers.supportedBuild === null && <p className="status-muted">No Supported build is set, so nothing is sent to any game server.</p>}
          {status.gameServers.connectedByBuild.length > 0 && <ul className="status-builds" aria-label="Connected by reported build">{status.gameServers.connectedByBuild.map(({ buildStamp, count, supported }) => <li key={buildStamp ?? ''}>
            <strong>{count}</strong> {buildStamp === null ? 'reporting no build stamp' : <>on <code>{buildStamp}</code></>}{supported && <span className="role-pill admin">Supported build</span>}
          </li>)}</ul>}
        </section>

        <ActivitySection activity={status.activity} />

        <section className="status-section" aria-labelledby="status-backup">
          <h2 id="status-backup" className="preset-section-title">Backup</h2>
          <p className="status-line">{status.backup.lastConfirmedAt === null ? status.backup.summary : <time dateTime={iso(status.backup.lastConfirmedAt)} title={when(status.backup.lastConfirmedAt)}>{status.backup.summary}</time>}</p>
          <p className="status-line">{status.restoreCheck.checkedAt === null ? status.restoreCheck.summary : <time dateTime={iso(status.restoreCheck.checkedAt)} title={when(status.restoreCheck.checkedAt)}>{status.restoreCheck.summary}</time>}</p>
          {status.restoreCheck.reason && <p className="status-muted">{status.restoreCheck.reason}</p>}
        </section>

        <section className="status-section" aria-labelledby="status-health">
          <h2 id="status-health" className="preset-section-title">Health</h2>
          <dl className="server-facts">
            <dt>Release commit</dt><dd>{status.health.releaseCommit ? <code title={status.health.releaseCommit}>{status.health.releaseCommit.slice(0, 12)}</code> : 'Unknown: not running from a release folder'}</dd>
            <dt>Running since</dt><dd><time dateTime={iso(status.health.startedAt)}>{when(status.health.startedAt)}</time></dd>
            <dt>Since start</dt><dd>{plural(status.health.warnings, 'warning')}, {plural(status.health.errors, 'error')}</dd>
          </dl>
          {status.health.recent.length === 0 ? <p className="status-muted status-log-empty">No warnings or errors since start</p>
            : <ol className="status-log" aria-label="Newest warnings and errors">{status.health.recent.map((entry, index) => <li key={`${entry.time}-${index}`} className={entry.level}>
              <time dateTime={entry.time}>{when(entry.time)}</time><span className="level">{entry.level === 'warn' ? 'Warning' : 'Error'}</span><code>{entry.event}</code><span className="message">{entry.message}</span>
            </li>)}</ol>}
        </section>
      </>}
  </div>;
}
