'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { toast } from 'sonner';
import { ApplyDialog, blockedReason, DiscardDialog, loadReview } from '@/components/game-servers/ApplyDialog';
import { Ago, ConnectionBadge, LiveConfigurationBadge } from '@/components/game-servers/StatusBadges';
import { LoadVersionDialog, OriginLabel, SaveVersionDialog } from '@/components/rulesets';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRefreshingJson } from '@/lib/hooks/useRefreshingJson';
import type { GameServerView } from '@/lib/platform/game-servers';
import type { ApplyReview } from '@/lib/platform/live-configurations';
import type { Origin } from '@/lib/platform/origins';
import { refusedCount, useConfigStore } from '@/lib/store/configStore';

/**
 * The editor's floating bar (online-platform#47): where the open Draft stands
 * against the Live configuration, Apply to game server through the same review
 * as the game server's page, and the ⋯ menu of whole-Draft writes.
 */

export type DraftMenuAction = 'save-new' | 'save-next' | 'load-version' | 'load-defaults' | 'load-live';
export type DraftMenuGroup = { label: string; items: { action: DraftMenuAction; label: string }[] };

/**
 * The ⋯ menu: Save as Ruleset version, to a new Ruleset or as the next version
 * of the origin's; and what can replace the whole Draft: a Ruleset version,
 * game defaults (Reset), or, while it has Unapplied changes from one, the Live
 * configuration (Discard changes).
 */
export function draftMenu(origin: Origin | null, discardable: boolean): DraftMenuGroup[] {
  return [
    { label: 'Save the Draft as', items: [
      { action: 'save-new', label: 'New Ruleset…' },
      ...origin ? [{ action: 'save-next' as const, label: `Next version of ${origin.rulesetName}…` }] : [],
    ] },
    { label: 'Load into the Draft', items: [
      { action: 'load-version', label: 'Ruleset version…' },
      { action: 'load-defaults', label: 'Game defaults…' },
      ...discardable ? [{ action: 'load-live' as const, label: 'Live configuration…' }] : [],
    ] },
  ];
}

/** The Draft's overrides, as the bar counts them: the sidebars say where they are. */
export const overridesText = (total: number) => total ? `${total} override${total === 1 ? '' : 's'}` : 'Everything at game default';

/**
 * Where the open Draft stands: Unapplied changes, a match with the Live
 * configuration or nothing applied yet, with its overrides and origin; then
 * the Live configuration's state and the connection status. While `refused`
 * fields show a refused value, the bar says that first: what the fields show
 * is not what was saved. Blocked and Failed link to the game server's page,
 * which explains them. Until the game server's view loads, the overrides alone.
 */
export function DraftStanding({ server, error, overrides, origin, refused = 0, onShowServer }: {
  server?: GameServerView; error?: string; overrides: string; origin: Origin | null; refused?: number; onShowServer: () => void;
}) {
  const live = server?.liveConfiguration;
  const standing = !server ? undefined : refused ? 'refused' : server.unappliedChanges ? 'unapplied' : live ? 'matches' : 'none';
  const headline = { refused: `${refused} refused value${refused === 1 ? '' : 's'}`, unapplied: 'Unapplied changes', matches: 'Matches the Live configuration', none: 'Nothing applied yet' };
  return <div className="bar-copy">
    <p className="bar-standing"><span className={`status-dot${standing === 'refused' ? ' blocked' : standing === 'unapplied' ? ' unapplied' : standing === 'matches' ? ' changed' : ''}`} />
      {standing ? <><strong className={standing}>{headline[standing]}</strong><span>{overrides}</span></> : <strong>{overrides}</strong>}
      {origin && <span className="bar-origin">from <OriginLabel origin={origin} /></span>}
    </p>
    <p className="bar-live">{!server ? <span role={error ? 'alert' : undefined}>{error || 'Checking the game server…'}</span> : <>
      {live ? <>
        <span aria-hidden="true">Live configuration</span><LiveConfigurationBadge live={live} />
        {live.state === 'confirmed' || live.state === 'failed' ? <Ago time={live.reportedAt} /> : <span>applied <Ago time={live.appliedAt} /></span>}
      </> : <span>No Live configuration yet</span>}
      <span aria-hidden="true">·</span><ConnectionBadge connection={server.connection} />
      {live && (live.state === 'failed' || live.state === 'blocked') && <button type="button" className="link-button" onClick={onShowServer}>Details</button>}
    </>}</p>
  </div>;
}

function MenuGroup({ group, onChoose }: { group: DraftMenuGroup; onChoose: (action: DraftMenuAction) => void }) {
  const label = useId();
  return <DropdownMenuGroup aria-labelledby={label}>
    <DropdownMenuLabel id={label}>{group.label}</DropdownMenuLabel>
    {group.items.map(item => <DropdownMenuItem key={item.action} onSelect={() => onChoose(item.action)}>{item.label}</DropdownMenuItem>)}
  </DropdownMenuGroup>;
}

export function DraftBar({ server: { id, name }, overrides, onShowServer }: { server: { id: number; name: string }; overrides: string; onShowServer: () => void }) {
  const { data: server, error, refresh } = useRefreshingJson<GameServerView>(`/api/game-servers/${id}`);
  const draft = useConfigStore(state => state.draft);
  const loading = useConfigStore(state => state.loading);
  const refused = useConfigStore(refusedCount);
  const ready = !!draft && !loading;
  const [dialog, setDialog] = useState<Exclude<DraftMenuAction, 'load-live'> | null>(null);
  const [review, setReview] = useState<ApplyReview | 'loading' | null>(null);
  const [discarding, setDiscarding] = useState<ApplyReview | null>(null);
  const [resetting, setResetting] = useState(false);
  const chosen = useRef<DraftMenuAction | null>(null);
  // A save, a load or a Reset moves the Draft's revision, and with it Unapplied changes: the bar checks at once.
  useEffect(() => useConfigStore.subscribe((state, previous) => {
    if (state.draft?.revision !== previous.draft?.revision) refresh();
  }), [refresh]);
  const blocked = server && blockedReason(server);
  const openReview = async () => {
    setReview('loading');
    setReview(await loadReview(id) ?? null);
  };
  const choose = async (action: DraftMenuAction) => {
    if (action !== 'load-live') return setDialog(action);
    const loaded = await loadReview(id);
    if (loaded) setDiscarding(loaded);
  };
  const loadDefaults = async () => {
    setResetting(true);
    try {
      await useConfigStore.getState().resetToGameDefaults();
      toast.success('Game defaults loaded into the Draft');
    } catch (failure) {
      toast.error((failure as Error).message);
    } finally {
      setResetting(false);
      setDialog(null);
    }
  };
  const closeDialog = (open: boolean) => { if (!open) setDialog(null); };
  return <footer className="floating-bar">
    <DraftStanding server={server} error={error} overrides={overrides} origin={draft?.origin ?? null} refused={refused} onShowServer={onShowServer} />
    <div className="bar-actions">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="outline-button bar-menu-button" disabled={!ready} aria-label="Save or load the Draft" title="Save or load the Draft"><Ellipsis size={16} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="draft-menu" onCloseAutoFocus={() => {
          // The chosen item's dialog opens once the menu has given focus back to ⋯, so the menu does not take it from the dialog.
          const action = chosen.current;
          chosen.current = null;
          if (action) setTimeout(() => void choose(action));
        }}>
          {draftMenu(draft?.origin ?? null, !!server?.liveConfiguration && server.unappliedChanges).map((group, index) => <div key={group.label}>
            {index > 0 && <DropdownMenuSeparator />}
            <MenuGroup group={group} onChoose={action => { chosen.current = action; }} />
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className="primary-button" disabled={!server || !!blocked || !ready || review === 'loading'} onClick={openReview}>{blocked ? `Apply · ${blocked}` : 'Apply to game server'}</button>
    </div>
    {server && review && review !== 'loading' && <ApplyDialog server={server} review={review} onReview={setReview} onClose={() => setReview(null)} onApplied={refresh} />}
    {server && discarding && <DiscardDialog server={server} review={discarding} onClose={() => setDiscarding(null)} onDiscarded={refresh} />}
    {(dialog === 'save-new' || dialog === 'save-next') && <SaveVersionDialog newRuleset={dialog === 'save-new'} onOpenChange={closeDialog} />}
    {dialog === 'load-version' && <LoadVersionDialog serverName={name} onOpenChange={closeDialog} />}
    <AlertDialog open={dialog === 'load-defaults'} onOpenChange={open => { if (!resetting) closeDialog(open); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Load game defaults into {name}&apos;s Draft?</AlertDialogTitle><AlertDialogDescription>Removes every value from the Draft{draft?.dropped ? `, including the ${draft.dropped} not shown` : ''}, and clears its origin. Nothing reaches the game server until you Apply.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel><AlertDialogAction disabled={resetting} onClick={event => {
        event.preventDefault();
        void loadDefaults();
      }}>{resetting ? 'Loading…' : 'Load game defaults'}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </footer>;
}
