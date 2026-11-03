'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';

/** As `/api/operator/invites` lists it: never the code. */
interface Invite {
  id: number;
  madeAt: number;
  expiresAt: number;
}

async function call<Result>(path: string, method = 'GET'): Promise<Result> {
  const response = await fetch(path, { method, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `The platform answered ${response.status}`);
  return data as Result;
}

const when = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The platform operator's Invites: make one (its link is shown once, here), see the unused ones and revoke one. */
export function InvitesPage() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const load = useCallback(async () => {
    try {
      const { invites } = await call<{ invites: Invite[] }>('/api/operator/invites');
      setInvites(invites);
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const make = async () => {
    setMaking(true);
    try {
      setLink((await call<{ link: string }>('/api/operator/invites', 'POST')).link);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMaking(false);
    }
  };
  const revoke = async (id: number) => {
    try {
      await call(`/api/operator/invites/${id}/revoke`, 'POST');
      toast.success(`Invite ${id} revoked`);
    } catch (error) {
      toast.error((error as Error).message);
    }
    await load();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it.');
    }
  };

  return <div className="users-page">
    <div className="standalone-heading"><div><h1>Invites</h1><p className="page-description">An Invite link lets one Discord account in as a server owner. It works once and expires after 7 days. A server owner who opens one is just signed in, and the Invite stays unused.</p></div><button className="primary-button" disabled={making} onClick={make}>{making ? 'Making…' : 'Make an Invite'}</button></div>
    {link && <section className="invite-link" aria-label="New Invite link"><p><strong>Copy this link now: it is not shown again.</strong> Send it to the person you are inviting however you like.</p><div><input readOnly value={link} aria-label="Invite link" onFocus={event => event.currentTarget.select()} /><button className="outline-button" onClick={copy}><Copy size={13} />Copy</button><button className="outline-button" onClick={() => setLink(null)}>Done</button></div></section>}
    <h2 className="preset-section-title invites-heading">Unused Invites</h2>
    {loadError ? <div className="empty-state" role="alert">{loadError} <button className="outline-button" onClick={() => void load()}>Retry</button></div>
      : invites === null ? <p className="empty-state">Loading Invites…</p>
      : invites.length === 0 ? <p className="empty-state">No unused Invites</p>
      : <ul className="user-list">{invites.map(invite => <li key={invite.id} className="user-row"><strong>Invite {invite.id}</strong><span className="invite-times">Made {relativeTime(invite.madeAt)} · expires <time dateTime={new Date(invite.expiresAt).toISOString()}>{when(invite.expiresAt)}</time></span><button className="outline-button remove-user" onClick={() => revoke(invite.id)}>Revoke</button></li>)}</ul>}
  </div>;
}
