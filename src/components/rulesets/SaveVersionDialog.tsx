'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { countOverrides } from '@/components/console/model';
import type { RulesetSummary } from '@/lib/platform/rulesets';
import { useConfigStore } from '@/lib/store/configStore';

/** The owner's Rulesets, fetched once when a dialog mounts; an error says why they did not load. */
export function useRulesets() {
  const [rulesets, setRulesets] = useState<RulesetSummary[] | undefined>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    fetch('/api/rulesets', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as { success?: boolean; data?: RulesetSummary[]; error?: string };
        if (!current) return;
        if (response.ok && body.data) setRulesets(body.data);
        else setError(body.error || `Could not load your Rulesets (${response.status})`);
      })
      .catch(() => { if (current) setError('Could not reach the platform'); });
    return () => { current = false; };
  }, []);
  return { rulesets, error };
}

/**
 * Save as Ruleset version: the open Draft becomes version 1 of a new Ruleset
 * or the next version of one of the owner's, with an optional description,
 * and that version its origin. Nothing is applied. Mounted while open.
 */
export function SaveVersionDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { rulesets, error } = useRulesets();
  const count = useConfigStore(state => countOverrides(state.values));
  // 'new', or the id of the Ruleset to add the next version to: at first the Draft's origin's, the likely next version.
  const [target, setTarget] = useState<'new' | number>(() => useConfigStore.getState().draft?.origin?.rulesetId ?? 'new');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState('');
  const chosen = target === 'new' ? undefined : rulesets?.find(ruleset => ruleset.id === target);
  // The origin's Ruleset may have been deleted elsewhere.
  const effective = target !== 'new' && rulesets && !chosen ? 'new' : target;
  const valid = effective === 'new' ? name.trim().length > 0 : !!chosen;
  const close = () => { if (!saving) onOpenChange(false); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setRefusal('');
    try {
      const saved = await useConfigStore.getState().saveRulesetVersion(effective === 'new' ? { name } : { rulesetId: effective }, description);
      toast.success(`Saved as ${saved.ruleset.name} version ${saved.version.number}. It is the Draft's origin now; nothing was applied.`);
      onOpenChange(false);
    } catch (failure) {
      setRefusal((failure as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const nextNumber = (ruleset: RulesetSummary) => (ruleset.versions[0]?.number ?? 0) + 1;
  return <Dialog open onOpenChange={next => { if (!next) close(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[480px]">
      <form onSubmit={save}>
        <DialogHeader>
          <DialogTitle>Save as Ruleset version</DialogTitle>
          <DialogDescription>Saves the Draft&apos;s {count} override{count === 1 ? '' : 's'} as a new version that never changes. Nothing reaches the game server.</DialogDescription>
        </DialogHeader>
        <fieldset className="ruleset-choices" disabled={saving}>
          <legend className="sr-only">Ruleset</legend>
          <label className="ruleset-choice"><input type="radio" name="ruleset-target" checked={effective === 'new'} onChange={() => setTarget('new')} /><span>New Ruleset, as version 1</span></label>
          {effective === 'new' && <Input aria-label="New Ruleset name" placeholder="Name, e.g. Competitive" value={name} maxLength={64} autoComplete="off" autoFocus onChange={event => setName(event.target.value)} />}
          {rulesets?.map(ruleset => <label key={ruleset.id} className="ruleset-choice"><input type="radio" name="ruleset-target" checked={effective === ruleset.id} onChange={() => setTarget(ruleset.id)} /><span>Next version of <strong>{ruleset.name}</strong>: version {nextNumber(ruleset)}</span></label>)}
          {!rulesets && <p className="empty-state" role={error ? 'alert' : undefined}>{error || 'Loading your Rulesets…'}</p>}
        </fieldset>
        <label className="ruleset-description"><span>Description <small>(optional)</small></span><Textarea value={description} maxLength={500} rows={3} disabled={saving} placeholder="What changed in this version?" onChange={event => setDescription(event.target.value)} /></label>
        {refusal && <p className="dialog-error" role="alert">{refusal}</p>}
        <DialogFooter>
          <button type="button" className="outline-button" disabled={saving} onClick={close}>Cancel</button>
          <button type="submit" className="primary-button" disabled={!valid || saving}>{saving ? 'Saving…' : effective === 'new' ? 'Save version 1' : `Save version ${chosen ? nextNumber(chosen) : ''}`}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
