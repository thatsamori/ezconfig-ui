'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useConfigStore, flushConfigWrites } from '@/lib/store/configStore';
import { countOverrides } from '@/components/console/model';
export function SavePresetDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const count = useConfigStore(state => countOverrides(state.values));
  const name = title.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const valid = title.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(name);
  const close = () => {
    if (saving) return;
    setTitle('');
    setDescription('');
    onOpenChange(false);
  };
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await flushConfigWrites();
      const response = await fetch('/api/presets/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          title: title.trim(),
          description: description.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save preset');
      toast.success(`Preset "${title}" saved`);
      setTitle('');
      setDescription('');
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open={open} onOpenChange={next => {
    if (!next) close();
  }}><DialogContent className="save-preset-dialog sm:max-w-[440px]"><DialogHeader><DialogTitle>Save as preset</DialogTitle><DialogDescription>Snapshots the {count} current overrides.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label htmlFor="preset-title">Title</Label><Input id="preset-title" placeholder="My preset" value={title} disabled={saving} onChange={event => setTitle(event.target.value)} />{title && !valid && <p className="text-xs text-destructive">Include a letter or number in the title.</p>}</div><div className="grid gap-2"><Label htmlFor="preset-description">Description</Label><Textarea id="preset-description" value={description} disabled={saving} onChange={event => setDescription(event.target.value)} placeholder="What does this preset change?" rows={3} /></div></div><DialogFooter><Button variant="outline" disabled={saving} onClick={close}>Cancel</Button><Button disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : 'Save preset'}</Button></DialogFooter></DialogContent></Dialog>;
}
