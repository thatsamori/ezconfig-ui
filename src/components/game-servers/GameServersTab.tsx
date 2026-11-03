'use client';

import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Check, CircleX, Copy, Server, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRefreshingJson } from '@/lib/hooks/useRefreshingJson';
import type { ConnectionStatus, GameServerView } from '@/lib/platform/game-servers';
import type { ApplyReview, ReviewEntry } from '@/lib/platform/live-configurations';
import { flushConfigWrites } from '@/lib/store/configStore';

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
 * Draft in the editor; `initialOpenId` opens on a game server's page. The
 * list and the page show the Live configuration's state (Pending, Confirmed
 * or Failed) apart from the connection status; the page also shows Unapplied
 * changes, and Applies the Draft after a review, or discards its changes.
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
      Not connected · last seen <Ago time={connection.lastSeenAt} />
    </>}</span>
  </span>;
}

type LiveConfigurationView = NonNullable<GameServerView['liveConfiguration']>;
const LIVE_STATE: Record<LiveConfigurationView['state'], string> = { pending: 'Pending', confirmed: 'Confirmed', failed: 'Failed' };

/** The Live configuration's state, its own indicator beside the connection status: Failed stays shown when the game server is Not connected. */
function LiveConfigurationBadge({ live }: { live: LiveConfigurationView }) {
  return <span className={`live-badge ${live.state}`} title={`Live configuration: ${LIVE_STATE[live.state]}`}>
    <span className={`status-dot ${live.state}`} /><span><span className="sr-only">Live configuration </span>{LIVE_STATE[live.state]}</span>
  </span>;
}

const Ago = ({ time }: { time: number }) => <time dateTime={new Date(time).toISOString()} title={new Date(time).toLocaleString()}>{relativeTime(time)}</time>;

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
        <button className="server-row" onClick={() => onOpen(server.id)}><span className="preset-icon"><Server size={15} /></span><strong>{server.name}</strong>{server.needsUpdating && <span className="needs-updating-tag">{server.needsUpdating.supported ? 'EZConfig needs updating' : 'No Supported build yet'}</span>}{server.liveConfiguration && <LiveConfigurationBadge live={server.liveConfiguration} />}<ConnectionBadge connection={server.connection} /></button>
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
      <div className="standalone-heading"><div><p className="crumb">Game server</p><h1>{server.name}</h1></div>{server.liveConfiguration && <LiveConfigurationBadge live={server.liveConfiguration} />}<ConnectionBadge connection={server.connection} /></div>
      {server.needsUpdating && <NeedsUpdating build={server.needsUpdating} />}
      {server.sharedKey && <div className="shared-key-warning" role="alert"><TriangleAlert size={16} /><div>
        <strong>More than one server is using this key</strong>
        <p>Polls from different game servers with this key keep replacing each other. Each game server needs its own key: register the other server separately, then <RegenerateKeyButton onClick={confirmRegenerateKey} /> here and put the new key in this server&apos;s Game.ini only.</p>
      </div></div>}
      <DraftSection server={server} onEditDraft={onEditDraft} onChanged={refresh} />
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

const BLOCKED: Record<NonNullable<GameServerView['applyBlocked']>, string> = { 'never-connected': 'Never connected', 'not-connected': 'Not connected', 'needs-updating': 'EZConfig needs updating' };
/** Why Apply is disabled, as its button says it; undefined while it is not. */
const blockedReason = (server: GameServerView) => !server.applyBlocked ? undefined
  : server.applyBlocked === 'needs-updating' && !server.needsUpdating?.supported ? 'No Supported build yet' : BLOCKED[server.applyBlocked];

/** The review of an Apply now, once the editor's saves have finished; undefined after saying in a toast why it failed. */
async function loadReview(id: number): Promise<ApplyReview | undefined> {
  // The review is of the saved Draft; the editor shows any save that failed.
  await flushConfigWrites().catch(() => {});
  return (await send<ApplyReview>(`/api/game-servers/${id}/apply`, 'GET'))?.data;
}

/**
 * The Draft beside the Live configuration: none yet, or its state; Unapplied
 * changes; Edit Draft, Discard changes and Apply. Apply
 * opens the review first, and is disabled, saying why, unless the game server
 * is Connected and on the Supported build.
 */
function DraftSection({ server, onEditDraft, onChanged }: { server: GameServerView; onEditDraft?: (server: { id: number; name: string }) => void; onChanged: () => void }) {
  const [review, setReview] = useState<ApplyReview | 'loading' | null>(null);
  const [discarding, setDiscarding] = useState<ApplyReview | null>(null);
  const live = server.liveConfiguration;
  const blocked = blockedReason(server);
  const openReview = async () => {
    setReview('loading');
    setReview(await loadReview(server.id) ?? null);
  };
  const openDiscard = async () => {
    const loaded = await loadReview(server.id);
    if (loaded) setDiscarding(loaded);
  };
  const discard = async (base: ApplyReview) => {
    try {
      const response = await fetch(`/api/game-servers/${server.id}/draft/discard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: base.revision }) });
      const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; data?: unknown };
      if (response.ok && body.success) toast.success('Changes discarded: the Draft is the Live configuration again');
      else toast.error(response.status === 409 && body.data ? 'The Draft changed meanwhile, so nothing was discarded. Check it, then discard again' : body.error || `The platform refused (${response.status})`);
    } catch {
      toast.error('Could not reach the platform');
    }
    onChanged();
  };
  const changes = discarding ? discarding.added.length + discarding.changed.length + discarding.reset.length : 0;
  return <section className="draft-entry" aria-label="Draft">
    <div className="draft-copy">
      <h3>Draft{server.unappliedChanges && <span className="unapplied-tag">Unapplied changes</span>}</h3>
      <p>Edit Character and Weapon config here. The Draft saves as you edit; nothing reaches the game server until you Apply.</p>
      {live ? <LiveConfigurationState live={live} /> : <p className="live-state">Live configuration: <strong>none yet</strong>. The game server runs its own saved EZConfig values until the first Apply.</p>}
    </div>
    <div className="draft-actions">
      {onEditDraft && <button className="outline-button" onClick={() => onEditDraft({ id: server.id, name: server.name })}>Edit Draft</button>}
      {live && server.unappliedChanges && <button className="outline-button" onClick={openDiscard}>Discard changes</button>}
      <button className="primary-button" disabled={!!blocked || review === 'loading'} onClick={openReview}>{blocked ? `Apply · ${blocked}` : 'Review and Apply'}</button>
    </div>
    {review && review !== 'loading' && <ApplyDialog server={server} review={review} onReview={setReview} onClose={() => setReview(null)} onApplied={onChanged} />}
    <Confirm open={discarding !== null} onClose={() => setDiscarding(null)} onConfirm={() => { if (discarding) void discard(discarding); }} title="Discard changes?" action="Discard changes">
      {changes ? `The Draft's ${changes} unapplied change${changes === 1 ? '' : 's'} are lost, and it` : 'The Draft'} goes back to the Live configuration applied {live ? relativeTime(live.appliedAt) : ''}. This can&apos;t be undone.
    </Confirm>
  </section>;
}

/**
 * What the game server reported of the Live configuration: Pending for as
 * long as it has been applied; Confirmed, with when, and a warning naming any
 * keys its build ignored; or Failed, with where processing stopped, the mod's
 * error, and what the server runs now.
 */
function LiveConfigurationState({ live }: { live: LiveConfigurationView }) {
  const applied = <>applied <Ago time={live.appliedAt} /></>;
  if (live.state === 'pending') return <p className="live-state">Live configuration: <strong>Pending</strong> · {applied}. The game server has not reported processing it yet.</p>;
  if (live.state === 'confirmed') return <>
    <p className="live-state">Live configuration: <strong className="confirmed">Confirmed</strong> <Ago time={live.reportedAt} /> · {applied}. The game server reported processing it.</p>
    {live.ignoredKeys.length > 0 && <div className="live-ignored" role="status"><TriangleAlert size={16} /><div>
      <strong>The game server ignored {live.ignoredKeys.length === 1 ? '1 key' : `${live.ignoredKeys.length} keys`} its EZConfig build does not know</strong>
      <ul>{live.ignoredKeys.map(ignored => <li key={`${ignored.database}/${ignored.category}/${ignored.key}`}>{place(ignored)} · <code>{ignored.key}</code></li>)}</ul>
      <p>Those values are not on the game server. The rest of the configuration is.</p>
    </div></div>}
  </>;
  const { database, category, error } = live.failure;
  const wipe = !database && !category;
  return <>
    <p className="live-state">Live configuration: <strong className="failed">Failed</strong> <Ago time={live.reportedAt} /> · {applied}.</p>
    <div className="live-failed" role="alert"><CircleX size={16} /><div>
      <strong>Processing stopped at {wipe ? 'the wipe, before any category' : place({ database, category })}</strong>
      {error && <p className="live-error">{error}</p>}
      <p>{wipe ? 'The game server runs none of this Live configuration: it still has the values it had before. It is not sent again on its own: Apply sends it again, with or without changes.'
        : 'The game server runs only the categories before it; the rest of this Live configuration did not reach it. It is not sent again on its own: fix the value in the Draft and Apply, or Apply with no changes to send it again.'}</p>
    </div></div>
  </>;
}

/**
 * The review, then Apply. When the Draft or the Live configuration moved on
 * since the review was built, Apply is refused and the review reopens as it is
 * now; values the schema refuses block Apply, listed to fix.
 */
function ApplyDialog({ server, review, onReview, onClose, onApplied }: {
  server: GameServerView; review: ApplyReview; onReview: (review: ApplyReview) => void; onClose: () => void; onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');
  const first = review.liveConfigurationId === null;
  const unchanged = !first && review.added.length + review.changed.length + review.reset.length === 0;
  const blocked = blockedReason(server);
  const apply = async () => {
    setApplying(true);
    setNotice('');
    try {
      const response = await fetch(`/api/game-servers/${server.id}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: review.revision, liveConfigurationId: review.liveConfigurationId }) });
      const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; reason?: string; data?: ApplyReview; details?: ApplyReview['errors'] };
      if (response.ok && body.success) {
        toast.success(`Applied to ${server.name}: the game server gets it within a few seconds`);
        onApplied();
        onClose();
      } else if (body.reason === 'stale' && body.data) {
        onReview(body.data);
        setNotice('The Draft or the Live configuration changed since this review was built. This is the review as it is now: check it, then Apply.');
      } else if (body.details) {
        onReview({ ...review, errors: body.details });
      } else {
        setNotice(body.error || `The platform refused (${response.status})`);
      }
    } catch {
      setNotice('Could not reach the platform');
    } finally {
      setApplying(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !applying) onClose(); }}>
    <DialogContent className="apply-review">
      <DialogHeader>
        <DialogTitle>Apply to {server.name}?</DialogTitle>
        <DialogDescription>The whole Draft becomes the Live configuration, and the game server gets it within a few seconds.</DialogDescription>
      </DialogHeader>
      <div className="apply-body">
        {notice && <p className="apply-notice" role="alert">{notice}</p>}
        {review.errors.length > 0 && <div className="apply-errors" role="alert"><strong>Fix these values in the Draft before you Apply</strong>
          <ul>{review.errors.map(error => <li key={`${error.database}/${error.category}/${error.key}`}><span className="apply-key">{place(error)} · <code>{error.key}</code></span><span>{error.error}</span></li>)}</ul>
        </div>}
        {first && <div className="apply-warning"><TriangleAlert size={16} /><p><strong>First Apply to this game server.</strong> Every EZConfig value it has now is replaced, and anything not in the Draft returns to game default.</p></div>}
        {first ? review.added.length ? <ReviewList title={`The Draft sets ${review.added.length} value${review.added.length === 1 ? '' : 's'}`} entries={review.added} />
          : <p className="apply-none">The Draft sets no values: every EZConfig value returns to game default.</p>
          : unchanged ? <p className="apply-none">No changes; the server will be sent this configuration again</p> : <>
            {review.added.length > 0 && <ReviewList title={`Added (${review.added.length})`} entries={review.added} />}
            {review.changed.length > 0 && <ReviewList title={`Changed (${review.changed.length})`} entries={review.changed} />}
            {review.reset.length > 0 && <ReviewList title={`Reset to game default (${review.reset.length})`} entries={review.reset} />}
          </>}
      </div>
      <DialogFooter>
        <button type="button" className="outline-button" disabled={applying} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={applying || review.errors.length > 0 || !!blocked} onClick={apply}>{applying ? 'Applying…' : blocked ? `Apply · ${blocked}` : 'Apply'}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Where a value sits, as the editor names it: a Character category, or a weapon and its category. */
const place = ({ database, category }: { database: string; category?: string }) => database === 'Character' ? category : `${database} · ${category}`;
const shown = (value: unknown) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

function ReviewList({ title, entries }: { title: string; entries: ReviewEntry[] }) {
  return <section className="apply-changes"><h4>{title}</h4><ul>{entries.map(entry => <li key={`${entry.database}/${entry.category}/${entry.key}`}>
    <span className="apply-key">{place(entry)} · <code>{entry.key}</code></span>
    <span className="apply-value">{'live' in entry && <><span className="apply-before">{shown(entry.live)}</span> → </>}{'draft' in entry ? shown(entry.draft) : 'game default'}</span>
  </li>)}</ul></section>;
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
