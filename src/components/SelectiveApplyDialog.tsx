'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { flushConfigWrites } from '@/lib/store/configStore';
import { useAuthStore } from '@/lib/store';
import { reviewRows, selectedReviewCommands, type ReviewRow } from '@/components/console/model';
export function SelectiveApplyDialog({
  open,
  onOpenChange,
  onApplyComplete
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyComplete: () => void;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [query, setQuery] = useState('');
  const [wipe, setWipe] = useState(true);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [server, setServer] = useState('the server');
  const [lastApplied, setLastApplied] = useState<{
    at: string;
    username: string;
    commands: number;
  } | null>(null);
  const token = useAuthStore(state => state.token);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      setQuery('');
      setWipe(true);
      try {
        await flushConfigWrites();
        const response = await fetch('/api/apply/preview');
        if (!response.ok) throw new Error('Could not load the apply preview. Close this dialog and try again.');
        const data = await response.json();
        const rows = reviewRows(data.commands);
        if (!cancelled) {
          setRows(rows);
          setSelected(new Set(rows.map(row => row.id)));
          setServer(data.serverName || 'the server');
          setLastApplied(data.lastApplied ?? null);
        }
      } catch (error) {
        if (!cancelled) setError((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);
  const toggle = (ids: string[], checked: boolean) => setSelected(previous => {
    const next = new Set(previous);
    ids.forEach(id => checked ? next.add(id) : next.delete(id));
    return next;
  });
  const databases = [...new Set(rows.map(row => row.database))];
  const apply = async () => {
    setApplying(true);
    try {
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        },
        body: JSON.stringify({
          commands: selectedReviewCommands(rows, selected),
          wipeDatabase: wipe
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not apply configuration');
      toast.success(`Sent ${data.commandsSent} commands to ${server}`);
      onOpenChange(false);
      onApplyComplete();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setApplying(false);
    }
  };
  const disabled = loading || applying || !!error;
  return <Dialog open={open} onOpenChange={next => {
    if (!applying) onOpenChange(next);
  }}><DialogContent className="review-dialog"><DialogHeader><DialogTitle>Review &amp; apply</DialogTitle><DialogDescription>{loading ? 'Loading saved changes…' : error ? 'The saved changes could not be loaded.' : rows.length ? `${selected.size} of ${rows.length} changes will be sent to ${server} over RCON. Untick anything to hold it back; it stays saved here.` : 'No overrides are stored. Applying with wipe on clears whatever the mod currently holds.'}</DialogDescription></DialogHeader>
    <div className="review-filter"><input aria-label="Filter by weapon or key" placeholder="Filter by weapon or key" value={query} onChange={event => setQuery(event.target.value)} /><div className="selection-buttons"><button disabled={disabled} onClick={() => setSelected(new Set(rows.map(row => row.id)))}>All</button><button disabled={disabled} onClick={() => setSelected(new Set())}>None</button></div></div>
    <div className="review-list">{loading ? <p className="empty-state">Loading saved changes…</p> : error ? <p role="alert" className="empty-state danger">{error}</p> : databases.map(database => {
          const all = rows.filter(row => row.database === database);
          const visible = all.filter(row => `${row.database} ${row.category} ${row.key}`.toLowerCase().includes(query.toLowerCase()));
          if (!visible.length) return null;
          const count = all.filter(row => selected.has(row.id)).length;
          return <section className="review-group" key={database}><label className="review-group-title"><Checkbox aria-label={`Select all ${database} changes`} disabled={disabled} checked={count === all.length ? true : count ? 'indeterminate' : false} onCheckedChange={checked => toggle(all.map(row => row.id), checked === true)} /><strong>{database}</strong><span>{count} of {all.length}</span></label>{visible.map(row => <label key={row.id} className={`review-row${selected.has(row.id) ? '' : ' unselected'}`}><Checkbox aria-label={`${row.database} ${row.category} ${row.key}`} disabled={disabled} checked={selected.has(row.id)} onCheckedChange={checked => toggle([row.id], checked === true)} /><span className="muted">{row.category}</span><span className="review-key" title={row.key}>{row.key}</span><span className="faint">Game default</span><span className="faint">→</span><span className="mono green" title={row.value}>{row.value}</span></label>)}</section>;
        })}{!loading && !error && rows.length > 0 && !rows.some(row => `${row.database} ${row.category} ${row.key}`.toLowerCase().includes(query.toLowerCase())) && <p className="empty-state">No changes match your search.</p>}</div>
    <footer className="review-footer"><label className="wipe-option"><Checkbox checked={wipe} disabled={disabled} onCheckedChange={checked => setWipe(checked === true)} />Wipe mod database first (recommended)</label>{lastApplied && <p className="last-applied">Last applied {new Date(lastApplied.at).toLocaleString()} by {lastApplied.username} · {lastApplied.commands} commands</p>}<div><button className="outline-button" disabled={applying} onClick={() => onOpenChange(false)}>Cancel</button><button className="primary-button" disabled={disabled || !selected.size && !wipe} onClick={apply}>{applying ? 'Applying…' : selected.size ? `Apply ${selected.size} changes` : wipe ? 'Wipe database only' : 'Nothing selected'}</button></div></footer>
  </DialogContent></Dialog>;
}
