'use client';

import { useRef, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GameServerView } from '@/lib/platform/game-servers';
import type { ApplyReview, ReviewEntry } from '@/lib/platform/live-configurations';
import { fieldName, flushConfigWrites, useConfigStore, type RefusedValue } from '@/lib/store/configStore';

/**
 * Apply and Discard changes, shared by the game server's page and the
 * editor's bar (online-platform#47): the review, with the stale checks of the
 * revision and Live configuration id it was built from, and the Discard
 * confirm.
 */

/** Sends a change to the platform: the response body, or undefined after saying in a toast why it failed. */
export async function send<T>(url: string, method: string): Promise<{ data?: T } | undefined> {
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

const BLOCKED: Record<NonNullable<GameServerView['applyBlocked']>, string> = { 'never-connected': 'Never connected', 'not-connected': 'Not connected', 'needs-updating': 'EZConfig needs updating' };
/** Why Apply is disabled, as its button says it; undefined while it is not. */
export const blockedReason = (server: GameServerView) => !server.applyBlocked ? undefined
  : server.applyBlocked === 'needs-updating' && !server.needsUpdating?.supported ? 'No Supported build yet' : BLOCKED[server.applyBlocked];

/** The review of an Apply now, once the editor's saves have finished; undefined after saying in a toast why it failed. */
export async function loadReview(id: number): Promise<ApplyReview | undefined> {
  // The review is of the saved Draft. The editor shows any save that failed, and names the edits a rejected one lost until they are dismissed.
  await flushConfigWrites().catch(() => {});
  return (await send<ApplyReview>(`/api/game-servers/${id}/apply`, 'GET'))?.data;
}

/** Where a value sits, as the editor names it: a Character category, or a weapon and its category. */
export const place = ({ database, category }: { database: string; category?: string }) => database === 'Character' ? category : `${database} · ${category}`;
const shown = (value: unknown) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** The values fields hold and refuse as typed: the review is of the saved Draft, which does not have them. */
export function RefusedValues({ values }: { values: RefusedValue[] }) {
  return <div className="apply-errors" role="alert"><strong>Refused, so not in the Draft: fix or discard before you Apply</strong>
    <ul>{values.map(value => <li key={fieldName(value.database, value.category, value.key)}><span className="apply-key">{place(value)} · <code>{value.key}</code></span><span>{value.text && `${value.text}: `}{value.error}</span></li>)}</ul>
  </div>;
}

/**
 * The review, then Apply. When the Draft or the Live configuration moved on
 * since the review was built, Apply is refused and the review reopens as it is
 * now; values the schema refuses block Apply, listed to fix, and so do values
 * the editor's fields refuse as typed, listed to fix or discard. Apply has focus
 * when the review opens, so Enter confirms, except on the first Apply, which
 * replaces every EZConfig value the game server has.
 */
export function ApplyDialog({ server, review, onReview, onClose, onApplied }: {
  server: GameServerView; review: ApplyReview; onReview: (review: ApplyReview) => void; onClose: () => void; onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');
  const applyButton = useRef<HTMLButtonElement>(null);
  const refused = useConfigStore(state => state.refused);
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
    <DialogContent className="apply-review" onOpenAutoFocus={event => {
      if (first || !applyButton.current || applyButton.current.disabled) return;
      event.preventDefault();
      applyButton.current.focus();
    }}>
      <DialogHeader>
        <DialogTitle>Apply to {server.name}?</DialogTitle>
        <DialogDescription>The whole Draft becomes the Live configuration, and the game server gets it within a few seconds.</DialogDescription>
      </DialogHeader>
      <div className="apply-body">
        {notice && <p className="apply-notice" role="alert">{notice}</p>}
        {refused.length > 0 && <RefusedValues values={refused} />}
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
        {refused.length > 0 && <button type="button" className="outline-button" onClick={() => refused.forEach(value => value.discard())}>Discard {refused.length === 1 ? 'this value' : 'these values'}</button>}
        <button type="button" className="primary-button" ref={applyButton} disabled={applying || refused.length > 0 || review.errors.length > 0 || !!blocked} onClick={apply}>{applying ? 'Applying…' : blocked ? `Apply · ${blocked}` : 'Apply'}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ReviewList({ title, entries }: { title: string; entries: ReviewEntry[] }) {
  return <section className="apply-changes"><h4>{title}</h4><ul>{entries.map(entry => <li key={`${entry.database}/${entry.category}/${entry.key}`}>
    <span className="apply-key">{place(entry)} · <code>{entry.key}</code></span>
    <span className="apply-value">{'live' in entry && <><span className="apply-before">{shown(entry.live)}</span> → </>}{'draft' in entry ? shown(entry.draft) : 'game default'}</span>
  </li>)}</ul></section>;
}

/**
 * Discard changes, confirmed, on `review` (loaded with `loadReview`): the
 * Draft becomes the Live configuration again if it is still at the review's
 * revision. A stale Discard hands the current Draft to the editor, which names
 * the edits it did not save. Mounted while open.
 */
export function DiscardDialog({ server, review, onClose, onDiscarded }: { server: GameServerView; review: ApplyReview; onClose: () => void; onDiscarded: () => void }) {
  const live = server.liveConfiguration;
  const changes = review.added.length + review.changed.length + review.reset.length;
  const discard = async () => {
    try {
      await useConfigStore.getState().discardChanges(server.id, review.revision);
      toast.success('Changes discarded: the Draft is the Live configuration again');
    } catch (error) {
      toast.error((error as Error).message);
    }
    onDiscarded();
  };
  return <Confirm open onClose={onClose} onConfirm={() => void discard()} title="Discard changes?" action="Discard changes">
    {changes ? `The Draft's ${changes} unapplied change${changes === 1 ? ' is' : 's are'} lost, and it` : 'The Draft'} goes back to the Live configuration applied {live ? relativeTime(live.appliedAt) : ''}. This can&apos;t be undone.
  </Confirm>;
}

export function Confirm({ open, onClose, onConfirm, title, action, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; action: string; children: ReactNode }) {
  return <AlertDialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{children}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
