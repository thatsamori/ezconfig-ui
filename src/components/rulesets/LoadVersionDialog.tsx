'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { relativeTime } from '@/components/console/model';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfigStore } from '@/lib/store/configStore';
import { useRulesets } from './SaveVersionDialog';

/**
 * Load a Ruleset version: one of the owner's versions replaces the whole open
 * Draft and becomes its origin. Values this build has no key or weapon for
 * are dropped, and the owner is told how many. Nothing goes live until Apply.
 * Mounted while open.
 */
export function LoadVersionDialog({ onOpenChange, serverName }: { onOpenChange: (open: boolean) => void; serverName: string }) {
  const { rulesets, error } = useRulesets();
  const [versionId, setVersionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refusal, setRefusal] = useState('');
  const chosen = rulesets?.flatMap(ruleset => ruleset.versions.map(version => ({ ruleset, version }))).find(({ version }) => version.id === versionId);
  const close = () => { if (!loading) onOpenChange(false); };
  const load = async () => {
    if (!chosen) return;
    setLoading(true);
    setRefusal('');
    try {
      const { dropped, errors } = await useConfigStore.getState().loadRulesetVersion(chosen.version.id);
      const left = dropped ? ` ${dropped} value${dropped === 1 ? ' was' : 's were'} dropped: this build has no key or weapon for ${dropped === 1 ? 'it' : 'them'}.` : '';
      toast.success(`Loaded ${chosen.ruleset.name} version ${chosen.version.number} into the Draft.${left} Nothing reaches the game server until you Apply.`);
      if (errors.length) toast.warning(`${errors.length} loaded value${errors.length === 1 ? '' : 's'} this build refuses: fix ${errors.length === 1 ? 'it' : 'them'} before you Apply (${errors.slice(0, 3).map(item => item.key).join(', ')}${errors.length > 3 ? ', …' : ''}).`);
      onOpenChange(false);
    } catch (failure) {
      setRefusal((failure as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return <Dialog open onOpenChange={next => { if (!next) close(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Load a Ruleset version</DialogTitle>
        <DialogDescription>The version replaces {serverName}&apos;s whole Draft and becomes its origin. Nothing reaches the game server until you Apply.</DialogDescription>
      </DialogHeader>
      <fieldset className="ruleset-choices ruleset-versions" disabled={loading}>
        <legend className="sr-only">Ruleset version</legend>
        {!rulesets ? <p className="empty-state" role={error ? 'alert' : undefined}>{error || 'Loading your Rulesets…'}</p>
          : rulesets.length === 0 ? <p className="empty-state">No Rulesets yet. Save a Draft as a Ruleset version first.</p>
          : rulesets.map(ruleset => <div key={ruleset.id} className="ruleset-group" role="group" aria-label={ruleset.name}>
            <h4>{ruleset.name}</h4>
            {ruleset.versions.map(version => <label key={version.id} className="ruleset-choice">
              <input type="radio" name="ruleset-version" checked={versionId === version.id} onChange={() => setVersionId(version.id)} />
              <span>Version {version.number}{version.description && <> · {version.description}</>} <small>saved <time dateTime={new Date(version.savedAt).toISOString()} title={new Date(version.savedAt).toLocaleString()}>{relativeTime(version.savedAt)}</time></small></span>
            </label>)}
          </div>)}
      </fieldset>
      {refusal && <p className="dialog-error" role="alert">{refusal}</p>}
      <DialogFooter>
        <button type="button" className="outline-button" disabled={loading} onClick={close}>Cancel</button>
        <button type="button" className="primary-button" disabled={!chosen || loading} onClick={load}>{loading ? 'Loading…' : chosen ? `Load version ${chosen.version.number}` : 'Load'}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
