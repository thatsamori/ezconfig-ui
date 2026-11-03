import { relativeTime } from '@/components/console/model';
import type { ConnectionStatus, GameServerView } from '@/lib/platform/game-servers';

/** A game server's indicators, on the server list, its page and the editor's bar. */

export const Ago = ({ time }: { time: number }) => <time dateTime={new Date(time).toISOString()} title={new Date(time).toLocaleString()}>{relativeTime(time)}</time>;

export function ConnectionBadge({ connection }: { connection: ConnectionStatus }) {
  return <span className={`connection ${connection.state}`}><span className={`status-dot ${connection.state === 'connected' ? 'changed' : connection.state}`} />
    <span>{connection.state === 'connected' ? 'Connected' : connection.state === 'never-connected' ? 'Never connected' : <>
      Not connected · last seen <Ago time={connection.lastSeenAt} />
    </>}</span>
  </span>;
}

export type LiveConfigurationView = NonNullable<GameServerView['liveConfiguration']>;
export const LIVE_STATE: Record<LiveConfigurationView['state'], string> = { pending: 'Pending', blocked: 'Blocked', confirmed: 'Confirmed', failed: 'Failed' };

/** The Live configuration's state, its own indicator beside the connection status: Failed stays shown when the game server is Not connected. */
export function LiveConfigurationBadge({ live }: { live: LiveConfigurationView }) {
  return <span className={`live-badge ${live.state}`} title={`Live configuration: ${LIVE_STATE[live.state]}`}>
    <span className={`status-dot ${live.state}`} /><span><span className="sr-only">Live configuration </span>{LIVE_STATE[live.state]}</span>
  </span>;
}
