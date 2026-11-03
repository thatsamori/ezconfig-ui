'use client';

import { useState, type FormEvent } from 'react';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRefreshingJson } from '@/lib/hooks/useRefreshingJson';
import type { RulesetSummary } from '@/lib/platform/rulesets';

/** Often enough to pick up a version another tab saved. */
const REFRESH_MS = 10_000;

/**
 * Rulesets: the owner's own, by name, each with its versions newest first.
 * Rename and Delete are here; saving a version and loading one are in a game
 * server's Draft editor, where the Draft is open.
 */
export function RulesetsTab() {
  const { data: rulesets, error, refresh } = useRefreshingJson<RulesetSummary[]>('/api/rulesets', REFRESH_MS);
  const [renaming, setRenaming] = useState<RulesetSummary | null>(null);
  const [deleting, setDeleting] = useState<RulesetSummary | null>(null);
  const remove = async (ruleset: RulesetSummary) => {
    try {
      const response = await fetch(`/api/rulesets/${ruleset.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (response.ok && body.success) toast.success(`${ruleset.name} deleted`);
      else toast.error(body.error || `The platform refused (${response.status})`);
    } catch {
      toast.error('Could not reach the platform');
    }
    refresh();
  };
  return <div className="game-servers-page rulesets-page">
    <div className="standalone-heading"><div><h1>Rulesets</h1><p className="page-description">Your saved configurations, each a series of versions that never change. In a game server&apos;s Draft editor, save the Draft as a version, or load any version into the Draft. Only you see your Rulesets.</p></div></div>
    {rulesets === undefined ? <p className="empty-state" role={error ? 'alert' : undefined}>{error || 'Loading your Rulesets…'}</p>
      : rulesets.length === 0 ? <p className="empty-state">No Rulesets yet. Open a game server&apos;s Draft and choose Save as Ruleset version.</p>
      : <ul className="ruleset-list">{rulesets.map(ruleset => <li key={ruleset.id} className="ruleset-card">
        <div className="ruleset-card-heading">
          <span className="preset-icon"><Bookmark size={15} /></span>
          <div><h2>{ruleset.name}</h2><p className="preset-meta">{ruleset.versions.length} version{ruleset.versions.length === 1 ? '' : 's'} · created {relativeTime(ruleset.createdAt)}</p></div>
          <div className="ruleset-actions">
            <button type="button" className="outline-button" aria-label={`Rename ${ruleset.name}`} onClick={() => setRenaming(ruleset)}>Rename</button>
            <button type="button" className="outline-button danger-button" aria-label={`Delete ${ruleset.name}`} onClick={() => setDeleting(ruleset)}>Delete</button>
          </div>
        </div>
        <ol className="ruleset-version-list">{ruleset.versions.map(version => <li key={version.id}>
          <strong>Version {version.number}</strong>
          {version.description ? <span className="ruleset-version-description">{version.description}</span> : <span className="ruleset-version-description none">No description</span>}
          <time dateTime={new Date(version.savedAt).toISOString()} title={new Date(version.savedAt).toLocaleString()}>{relativeTime(version.savedAt)}</time>
        </li>)}</ol>
      </li>)}</ul>}
    {rulesets !== undefined && error && <p className="refresh-error" role="status">{error}</p>}
    {renaming && <RenameDialog ruleset={renaming} onClose={() => setRenaming(null)} onRenamed={refresh} />}
    <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
          <AlertDialogDescription>This deletes the Ruleset with all {deleting?.versions.length === 1 ? 'its version' : `${deleting?.versions.length} of its versions`}. Drafts and Live configurations loaded from it keep their values, and no longer show it as their origin. This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (deleting) void remove(deleting); }}>Delete Ruleset</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function RenameDialog({ ruleset, onClose, onRenamed }: { ruleset: RulesetSummary; onClose: () => void; onRenamed: () => void }) {
  const [name, setName] = useState(ruleset.name);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState('');
  const rename = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal('');
    try {
      const response = await fetch(`/api/rulesets/${ruleset.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; data?: { name: string } };
      if (response.ok && body.data) {
        toast.success(`Renamed to ${body.data.name}`);
        onRenamed();
        onClose();
      } else {
        setRefusal(body.error || `The platform refused (${response.status})`);
      }
    } catch {
      setRefusal('Could not reach the platform');
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[440px]">
      <form onSubmit={rename}>
        <DialogHeader><DialogTitle>Rename {ruleset.name}</DialogTitle><DialogDescription>Names are unique among your Rulesets, ignoring case. Its versions keep their numbers.</DialogDescription></DialogHeader>
        <Input aria-label="Ruleset name" value={name} maxLength={64} autoComplete="off" autoFocus disabled={saving} aria-invalid={refusal ? true : undefined} onChange={event => setName(event.target.value)} />
        {refusal && <p className="dialog-error" role="alert">{refusal}</p>}
        <DialogFooter>
          <button type="button" className="outline-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>{saving ? 'Renaming…' : 'Rename'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
