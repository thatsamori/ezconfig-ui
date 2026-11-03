'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RULESET_FILE_LIMIT, RULESET_FILE_TOO_LARGE } from '@/lib/config/rulesetFile';
import type { ImportReview } from '@/lib/platform/rulesets';

/** The file the owner chose: what the platform says it holds, or why it refused it. */
export type ChosenFile = { fileName: string; refused: string } | { fileName: string; text: string; review: ImportReview };

const post = (body: object) => fetch('/api/rulesets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Asks the platform what a file holds, which writes nothing. The platform is the judge of the file. */
export async function reviewRulesetFile(file: File): Promise<ChosenFile> {
  const fileName = file.name;
  if (file.size > RULESET_FILE_LIMIT) return { fileName, refused: RULESET_FILE_TOO_LARGE };
  const text = await file.text().catch(() => undefined);
  if (text === undefined) return { fileName, refused: 'Could not read the file' };
  try {
    const response = await post({ file: text });
    const body = await response.json().catch(() => ({})) as { data?: ImportReview; error?: string };
    return response.ok && body.data ? { fileName, text, review: body.data } : { fileName, refused: body.error || `The platform refused (${response.status})` };
  } catch {
    return { fileName, refused: 'Could not reach the platform' };
  }
}

/**
 * Import a Ruleset file: shows what the file holds, and confirming makes it
 * version 1 of a new Ruleset. A taken name can be changed here. Everything shown
 * comes from a file someone else made, as text. Mounted while open.
 */
export function ImportRulesetDialog({ chosen, onClose, onImported }: { chosen: ChosenFile; onClose: () => void; onImported: () => void }) {
  if ('review' in chosen) return <ImportReviewDialog fileName={chosen.fileName} text={chosen.text} review={chosen.review} onClose={onClose} onImported={onImported} />;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[440px]">
      <DialogHeader><DialogTitle>This file can&apos;t be imported</DialogTitle><DialogDescription>{chosen.fileName}</DialogDescription></DialogHeader>
      <p className="dialog-error" role="alert">{chosen.refused}</p>
      <DialogFooter><button type="button" className="outline-button" onClick={onClose}>Close</button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ImportReviewDialog({ fileName, text, review, onClose, onImported }: { fileName: string; text: string; review: ImportReview; onClose: () => void; onImported: () => void }) {
  const [name, setName] = useState(review.name);
  const [importing, setImporting] = useState(false);
  // Why the platform refuses this name, until it changes; anything else can be tried again.
  const [nameRefusal, setNameRefusal] = useState(review.takenBy ? `You already have a Ruleset called ${review.takenBy}` : '');
  const [failure, setFailure] = useState('');
  const close = () => { if (!importing) onClose(); };
  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setImporting(true);
    setFailure('');
    try {
      const response = await post({ file: text, name, commit: true });
      const body = await response.json().catch(() => ({})) as { data?: { ruleset: { name: string } }; error?: string };
      if (response.ok && body.data) {
        toast.success(`Imported ${body.data.ruleset.name} as version 1. Nothing reaches a game server until you load it into a Draft and Apply.`);
        onImported();
        onClose();
      } else if (response.status === 400 || response.status === 409) {
        setNameRefusal(body.error || `The platform refused (${response.status})`);
      } else {
        setFailure(body.error || `The platform refused (${response.status})`);
      }
    } catch {
      setFailure('Could not reach the platform');
    } finally {
      setImporting(false);
    }
  };
  const unlisted = review.dropped - review.droppedValues.length;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="ruleset-dialog sm:max-w-[520px]">
      <form onSubmit={confirm}>
        <DialogHeader>
          <DialogTitle>Import a Ruleset</DialogTitle>
          <DialogDescription>From {fileName}. It becomes version 1 of a new Ruleset of yours. No Draft, Live configuration or game server changes.</DialogDescription>
        </DialogHeader>
        <label className="ruleset-description"><span>Name</span>
          <Input value={name} maxLength={64} autoComplete="off" autoFocus disabled={importing} aria-invalid={nameRefusal ? true : undefined} onChange={event => { setName(event.target.value); setNameRefusal(''); }} />
        </label>
        {nameRefusal && <p className="dialog-error" role="alert">{nameRefusal}</p>}
        <div className="ruleset-import-details">
          {review.description && <div className="ruleset-import-part"><h3>Description</h3><p className="ruleset-version-description">{review.description}</p></div>}
          <div className="ruleset-import-part"><h3>Values</h3><p>{plural(review.values, 'value')} will be imported.</p></div>
          {review.dropped > 0 && <div className="ruleset-import-part">
            <h3>Dropped</h3>
            <p>{plural(review.dropped, 'value')} will be dropped: this build has no place for {review.dropped === 1 ? 'it' : 'them'}, or would refuse {review.dropped === 1 ? 'it' : 'them'}.</p>
            <ul>
              {review.droppedValues.map((value, index) => <li key={index}>
                <strong>{[value.database, value.category, value.key].filter(part => part !== undefined).join(' · ')}</strong>: {value.error}
              </li>)}
              {unlisted > 0 && <li>and {unlisted} more</li>}
            </ul>
          </div>}
        </div>
        {failure && <p className="dialog-error" role="alert">{failure}</p>}
        <DialogFooter>
          <button type="button" className="outline-button" disabled={importing} onClick={close}>Cancel</button>
          <button type="submit" className="primary-button" disabled={importing || !name.trim() || nameRefusal !== ''}>{importing ? 'Importing…' : 'Import Ruleset'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
