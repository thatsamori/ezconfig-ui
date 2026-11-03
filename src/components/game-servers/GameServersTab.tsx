'use client';

import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Check, Copy, Server, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useRefreshingJson } from '@/lib/hooks/useRefreshingJson';
import type { ConnectionStatus, GameServerView } from '@/lib/platform/game-servers';

/** What the setup checklist pastes into Game.ini: the HTTP switch and the key, not the optional PlatformUrl. */
const gameIni = (gameServerKey: string) => `[/Script/Mordhau.MordhauGameSession]
bAllowHttpRequests=True

[EZConfigPlatform]
GameServerKey=${gameServerKey}`;

/**
 * Game servers: the owner's list with registering, and a game server's page
 * with its connection status, EZConfig needs updating when it runs another
 * build than the Supported build, and, until it first connects, the setup
 * checklist; Regenerate key, Delete and the shared-key warning. The Game
 * server key is shown on the page that registering or regenerating leaves
 * open, and gone once the owner leaves it. Edit Draft opens the game server's
 * Draft in the editor; `initialOpenId` opens on a game server's page.
 */
export function GameServersTab({ initialOpenId, onEditDraft }: { initialOpenId?: number; onEditDraft?: (server: { id: number; name: string }) => void } = {}) {
  const [openId, setOpenId] = useState<number | null>(initialOpenId ?? null);
  const [shown, setShown] = useState<{ id: number; gameServerKey: string } | null>(null);
  if (openId === null) return <ServerList onOpen={setOpenId} onRegistered={(id, gameServerKey) => {
    setShown({ id, gameServerKey });
    setOpenId(id);
  }} />;
  return <ServerPage id={openId} gameServerKey={shown?.id === openId ? shown.gameServerKey : undefined} onKey={gameServerKey => setShown({ id: openId, gameServerKey })} onEditDraft={onEditDraft} onBack={() => {
    setShown(null);
    setOpenId(null);
  }} />;
}

function ConnectionBadge({ connection }: { connection: ConnectionStatus }) {
  return <span className={`connection ${connection.state}`}><span className={`status-dot ${connection.state === 'connected' ? 'changed' : connection.state}`} />
    <span>{connection.state === 'connected' ? 'Connected' : connection.state === 'never-connected' ? 'Never connected' : <>
      Not connected · last seen <time dateTime={new Date(connection.lastSeenAt).toISOString()} title={new Date(connection.lastSeenAt).toLocaleString()}>{relativeTime(connection.lastSeenAt)}</time>
    </>}</span>
  </span>;
}

function ServerList({ onOpen, onRegistered }: { onOpen: (id: number) => void; onRegistered: (id: number, gameServerKey: string) => void }) {
  const { data: servers, error } = useRefreshingJson<GameServerView[]>('/api/game-servers');
  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [refusal, setRefusal] = useState('');
  const register = async (event: FormEvent) => {
    event.preventDefault();
    setRegistering(true);
    setRefusal('');
    try {
      const response = await fetch('/api/game-servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; data?: { gameServer: GameServerView; key: string } };
      if (response.ok && body.data) onRegistered(body.data.gameServer.id, body.data.key);
      else setRefusal(body.error || `Could not register the game server (${response.status})`);
    } catch {
      setRefusal('Could not reach the platform');
    } finally {
      setRegistering(false);
    }
  };
  return <div className="game-servers-page">
    <div className="standalone-heading"><div><h1>Game servers</h1><p className="page-description">Register a game server to get its Game server key. With the key in its Game.ini, EZConfig on the game server connects to the platform to receive configuration.</p></div></div>
    <form className="register-server" onSubmit={register}>
      <label htmlFor="game-server-name" className="sr-only">Game server name</label>
      <Input id="game-server-name" value={name} onChange={event => setName(event.target.value)} placeholder="Name, e.g. Duel EU" maxLength={64} autoComplete="off" aria-invalid={refusal ? true : undefined} />
      <button type="submit" className="primary-button" disabled={registering || !name.trim()}>{registering ? 'Registering…' : 'Register'}</button>
    </form>
    {refusal && <p className="form-error" role="alert">{refusal}</p>}
    <h3 className="preset-section-title">Yours</h3>
    {servers === undefined ? <p className="empty-state" role={error ? 'alert' : undefined}>{error || 'Loading game servers…'}</p>
      : servers.length === 0 ? <p className="empty-state">No game servers yet. Register one to get its key.</p>
      : <ul className="server-list">{servers.map(server => <li key={server.id}>
        <button className="server-row" onClick={() => onOpen(server.id)}><span className="preset-icon"><Server size={15} /></span><strong>{server.name}</strong>{server.needsUpdating && <span className="needs-updating-tag">{server.needsUpdating.supported ? 'EZConfig needs updating' : 'No Supported build yet'}</span>}<ConnectionBadge connection={server.connection} /></button>
      </li>)}</ul>}
    {servers !== undefined && error && <p className="refresh-error" role="status">{error}</p>}
  </div>;
}

/** Sends a change to the platform: the response body, or undefined after saying in a toast why it failed. */
async function send<T>(url: string, method: string): Promise<{ data?: T } | undefined> {
  try {
    const response = await fetch(url, { method });
    const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; data?: T };
    if (response.ok && body.success) return body;
    toast.error(body.error || `The platform refused (${response.status})`);
  } catch {
    toast.error('Could not reach the platform');
  }
  return undefined;
}

function ServerPage({ id, gameServerKey, onKey, onBack, onEditDraft }: {
  id: number; gameServerKey?: string; onKey: (gameServerKey: string) => void; onBack: () => void; onEditDraft?: (server: { id: number; name: string }) => void;
}) {
  const { data: server, error, refresh } = useRefreshingJson<GameServerView>(`/api/game-servers/${id}`);
  const [confirming, setConfirming] = useState<'regenerate-key' | 'delete' | null>(null);
  const confirmRegenerateKey = () => setConfirming('regenerate-key');
  const regenerateKey = async () => {
    const regenerated = await send<{ key: string }>(`/api/game-servers/${id}/regenerate-key`, 'POST');
    if (regenerated?.data) {
      onKey(regenerated.data.key);
      refresh();
    }
  };
  const remove = async (name: string) => {
    if (!await send(`/api/game-servers/${id}`, 'DELETE')) return;
    toast.success(`${name} deleted`);
    onBack();
  };
  return <div className="game-servers-page">
    <button className="outline-button back-button" onClick={onBack}><ArrowLeft size={14} />All game servers</button>
    {!server ? <p className="empty-state" role={error ? 'alert' : undefined}>{error || 'Loading the game server…'}</p> : <>
      <div className="standalone-heading"><div><p className="crumb">Game server</p><h1>{server.name}</h1></div><ConnectionBadge connection={server.connection} /></div>
      {server.needsUpdating && <NeedsUpdating build={server.needsUpdating} />}
      {server.sharedKey && <div className="shared-key-warning" role="alert"><TriangleAlert size={16} /><div>
        <strong>More than one server is using this key</strong>
        <p>Polls from different game servers with this key keep replacing each other. Each game server needs its own key: register the other server separately, then <RegenerateKeyButton onClick={confirmRegenerateKey} /> here and put the new key in this server&apos;s Game.ini only.</p>
      </div></div>}
      {onEditDraft && <section className="draft-entry"><div><h3>Draft</h3><p>Edit Character and Weapon config here. The Draft saves as you edit; nothing reaches the game server until you Apply.</p></div><button className="primary-button" onClick={() => onEditDraft({ id: server.id, name: server.name })}>Edit Draft</button></section>}
      {server.connection.state === 'never-connected' || gameServerKey ? <SetupChecklist server={server} gameServerKey={gameServerKey} onRegenerateKey={confirmRegenerateKey} /> : <dl className="server-facts">
        <dt>Reported build</dt><dd>{server.lastReport?.buildStamp ? <code>{server.lastReport.buildStamp}</code> : 'None reported'}</dd>
        <dt>Game server key</dt><dd>Ending in <code>{server.keyLast4}</code> · <RegenerateKeyButton onClick={confirmRegenerateKey} /></dd>
      </dl>}
      {error && <p className="refresh-error" role="status">{error}</p>}
      <div className="server-danger"><button type="button" className="outline-button danger-button" onClick={() => setConfirming('delete')}><Trash2 size={14} />Delete game server</button></div>
      <Confirm open={confirming === 'regenerate-key'} onClose={() => setConfirming(null)} onConfirm={regenerateKey} title="Regenerate key?" action="Regenerate key">
        This server stops receiving configuration until you put the new key in its Game.ini and restart it. The current key stops working at once.
      </Confirm>
      <Confirm open={confirming === 'delete'} onClose={() => setConfirming(null)} onConfirm={() => remove(server.name)} title={`Delete ${server.name}?`} action="Delete game server">
        This deletes the game server with its Draft, its Live configuration and its key, and it stops receiving configuration. Your Rulesets stay. This can&apos;t be undone.
      </Confirm>
    </>}
  </div>;
}

function RegenerateKeyButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="link-button" onClick={onClick}>Regenerate key</button>;
}

function Confirm({ open, onClose, onConfirm, title, action, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; action: string; children: ReactNode }) {
  return <AlertDialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{children}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** The game server runs a build that is not the Supported build, so the platform sends it nothing. */
function NeedsUpdating({ build }: { build: NonNullable<GameServerView['needsUpdating']> }) {
  const running = build.running ? <code>{build.running}</code> : 'a build with no build stamp';
  return <section className="needs-updating" aria-label="Build">
    {build.supported ? <>
      <h2>EZConfig needs updating</h2>
      <p>The game server runs {running}; the Supported build is <code>{build.supported}</code>. The platform sends configuration only to the Supported build, so this server gets nothing until it restarts onto it. Restart the game server to load the latest EZConfig.</p>
    </> : <>
      <h2>No Supported build yet</h2>
      <p>The game server runs {running}. The platform sends nothing to any game server until the platform operator sets the Supported build.</p>
    </>}
  </section>;
}

function SetupChecklist({ server, gameServerKey, onRegenerateKey }: { server: GameServerView; gameServerKey?: string; onRegenerateKey: () => void }) {
  const block = useRef<HTMLPreElement>(null);
  return <ol className="setup-checklist">
    <li><h3>Add EZConfig to the server&apos;s mods</h3><p>On your host&apos;s control panel, add the EZConfig mod to the game server&apos;s mod list.</p></li>
    <li><h3>{gameServerKey ? "Paste this block into the server's Game.ini" : "Put the key in the server's Game.ini"}</h3>
      {gameServerKey ? <>
        <div className="ini-copy"><pre className="ini-block" ref={block}>{gameIni(gameServerKey)}</pre><CopyButton text={gameIni(gameServerKey)} block={block} /></div>
        <p className="key-warning">You won&apos;t see this key again. Copy it now: afterwards this page shows only its last 4 characters.</p>
      </> : <p>Key ending in <code>{server.keyLast4}</code>. Lost it? <RegenerateKeyButton onClick={onRegenerateKey} />.</p>}
      <p>The block also sets <code>bAllowHttpRequests=True</code>, which lets the game server reach the platform. If Game.ini already has a <code>[/Script/Mordhau.MordhauGameSession]</code> section, add that line to it instead. If it already has a <code>GameServerKey</code> line, replace it: an old key no longer works.</p>
    </li>
    <li><h3>Restart the server</h3><p>EZConfig starts polling the platform with the key once the game server is back up.</p></li>
    <li><h3>Wait for Connected</h3><p>This page checks every 2 seconds. <ConnectionBadge connection={server.connection} /></p></li>
  </ol>;
}

/** Copies `text`; where the browser refuses, selects `block` for the owner to copy. */
function CopyButton({ text, block }: { text: string; block: RefObject<HTMLPreElement | null> }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      if (block.current) window.getSelection()?.selectAllChildren(block.current);
      toast.error('Could not copy. The block is selected: press Ctrl+C to copy it');
    }
  };
  return <button type="button" className="outline-button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>;
}
