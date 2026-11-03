'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ServerOwnerListing } from '@/lib/platform/server-owners';

async function call<Result>(path: string, method = 'GET', body?: unknown): Promise<Result> {
  const response = await fetch(path, {
    method, cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `The platform answered ${response.status}`);
  return data as Result;
}

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The platform operator's Server owners: everyone who can sign in, with Remove
 * access, Restore access and Delete (behind a typed confirm). None is offered
 * against a platform operator. Nothing of an owner's game servers, Drafts,
 * Live configurations or Rulesets is shown, only how many game servers they have.
 */
export function ServerOwnersPage() {
  const [owners, setOwners] = useState<ServerOwnerListing[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [removing, setRemoving] = useState<ServerOwnerListing | null>(null);
  const [deleting, setDeleting] = useState<ServerOwnerListing | null>(null);

  // Promise callbacks rather than await: react-hooks/set-state-in-effect accepts setState there.
  const load = useCallback(() => call<{ serverOwners: ServerOwnerListing[] }>('/api/operator/server-owners').then(({ serverOwners }) => {
    setOwners(serverOwners);
    setLoadError('');
  }, (error: Error) => setLoadError(error.message)), []);
  useEffect(() => { void load(); }, [load]);

  const change = async (owner: ServerOwnerListing, action: 'remove-access' | 'restore-access') => {
    try {
      await call(`/api/operator/server-owners/${owner.id}/${action}`, 'POST');
      toast.success(action === 'remove-access' ? `${owner.name}'s access removed` : `${owner.name}'s access restored`);
    } catch (error) {
      toast.error((error as Error).message);
    }
    await load();
  };

  return <div className="users-page">
    <div className="standalone-heading"><div><h1>Server owners</h1><p className="page-description">Everyone who can sign in. Remove access ends their sessions and refuses their sign-in, even with an Invite; their data stays and their game servers keep being answered. Restore access undoes it. Delete is for an erasure request. None of these is offered against a platform operator.</p></div></div>
    {loadError ? <div className="empty-state" role="alert">{loadError} <button className="outline-button" onClick={() => void load()}>Retry</button></div>
      : owners === null ? <p className="empty-state">Loading server owners…</p>
      : owners.length === 0 ? <p className="empty-state">No server owners yet</p>
      : <ul className="user-list">{owners.map(owner => <li key={owner.id} className="user-row owner-row">
        <span className="user-avatar" aria-hidden="true" style={{ backgroundImage: `url(${owner.avatarUrl})` }} />
        <div className="owner-details">
          <div><strong>{owner.name}</strong>{owner.operator ? <span className="role-pill admin">Platform operator</span> : owner.accessRemovedAt !== null && <span className="role-pill removed">Access removed {relativeTime(owner.accessRemovedAt)}</span>}</div>
          <span className="invite-times">First signed in {day(owner.firstSignedInAt)} · {owner.lastSeenAt === null ? 'not signed in' : `last seen ${relativeTime(owner.lastSeenAt)}`} · {plural(owner.gameServers, 'game server')}</span>
        </div>
        {!owner.operator && <>
          {owner.accessRemovedAt === null
            ? <button className="outline-button" onClick={() => setRemoving(owner)}>Remove access</button>
            : <button className="outline-button" onClick={() => void change(owner, 'restore-access')}>Restore access</button>}
          <button className="outline-button remove-user" onClick={() => setDeleting(owner)}>Delete</button>
        </>}
      </li>)}</ul>}
    <AlertDialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Remove {removing?.name}&apos;s access?</AlertDialogTitle><AlertDialogDescription>Their sessions end now and their sign-in is refused, even with an Invite. Nothing of theirs is deleted, and their game servers keep running their Live configurations, which cannot change. Restore access undoes it.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (removing) void change(removing, 'remove-access'); }}>Remove access</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {deleting && <DeleteDialog owner={deleting} onClose={() => setDeleting(null)} onDeleted={load} />}
  </div>;
}

/** Delete, for an erasure request: enabled once the operator has typed the server owner's name. */
function DeleteDialog({ owner, onClose, onDeleted }: { owner: ServerOwnerListing; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refusal, setRefusal] = useState('');
  const confirmed = typed.trim().normalize('NFC') === owner.name.trim().normalize('NFC');
  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    setDeleting(true);
    setRefusal('');
    try {
      await call(`/api/operator/server-owners/${owner.id}`, 'DELETE', { confirm: typed });
      toast.success(`${owner.name} deleted`);
      onClose();
      await onDeleted();
    } catch (error) {
      setRefusal((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !deleting) onClose(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[460px]">
      <form onSubmit={remove}>
        <DialogHeader><DialogTitle>Delete {owner.name}?</DialogTitle><DialogDescription>This cannot be undone. Their {plural(owner.gameServers, 'game server')}, with Drafts and Live configurations, their Rulesets and the Invite they used are deleted, and their game servers are refused from now on. Their Notes stay, shown as written by &ldquo;a former server owner&rdquo;.</DialogDescription></DialogHeader>
        <label className="owner-confirm"><span>Type <strong>{owner.name}</strong> to confirm</span><Input value={typed} autoComplete="off" spellCheck={false} autoFocus disabled={deleting} aria-invalid={refusal ? true : undefined} onChange={event => setTyped(event.target.value)} /></label>
        {refusal && <p className="dialog-error" role="alert">{refusal}</p>}
        <DialogFooter>
          <button type="button" className="outline-button" disabled={deleting} onClick={onClose}>Cancel</button>
          <button type="submit" className="outline-button danger-button" disabled={deleting || !confirmed}>{deleting ? 'Deleting…' : 'Delete server owner'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
