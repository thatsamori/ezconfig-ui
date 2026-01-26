'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useConfigStore, type ConfigValue } from '@/lib/store/configStore';
import { toast } from 'sonner';

export function ActionButtons() {
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const hasUnsavedChanges = useConfigStore((state) => state.hasUnsavedChanges);
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);
  const resetWorkingValues = useConfigStore((state) => state.resetWorkingValues);
  const commitWorkingToSaved = useConfigStore((state) => state.commitWorkingToSaved);

  // Build merged entries for a category (saved + working, with null tombstones removing entries)
  const buildMergedEntries = (
    saved: Record<string, ConfigValue> | undefined,
    working: Record<string, ConfigValue>
  ): Array<{ [key: string]: ConfigValue }> => {
    // Start with saved values
    const merged: Record<string, ConfigValue> = { ...saved };

    // Apply working changes
    for (const [key, value] of Object.entries(working)) {
      if (value === null) {
        // Tombstone: delete from merged
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }

    // Convert to array format, filtering out any null values (shouldn't happen, but be safe)
    return Object.entries(merged)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => ({ [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      let savedCount = 0;
      const errors: string[] = [];

      // Save character config changes
      for (const [category, workingEntries] of Object.entries(workingValues.character)) {
        const savedEntries = savedValues.character[category];
        const configEntries = buildMergedEntries(savedEntries, workingEntries);

        // Send even if empty (to clear the category file)
        const res = await fetch(`/api/config/Character/${category}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: configEntries }),
        });

        if (res.ok) {
          savedCount++;
        } else {
          const data = await res.json();
          errors.push(`Character/${category}: ${data.error || 'Unknown error'}`);
        }
      }

      // Save weapon config changes
      for (const [weapon, categories] of Object.entries(workingValues.weapons)) {
        for (const [category, workingEntries] of Object.entries(categories)) {
          const savedEntries = savedValues.weapons[weapon]?.[category];
          const configEntries = buildMergedEntries(savedEntries, workingEntries);

          // Send even if empty (to clear the category file)
          const res = await fetch(`/api/config/${weapon}/${category}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: configEntries }),
          });

          if (res.ok) {
            savedCount++;
          } else {
            const data = await res.json();
            errors.push(`${weapon}/${category}: ${data.error || 'Unknown error'}`);
          }
        }
      }

      if (errors.length > 0) {
        toast.error(`Failed to save some changes: ${errors.join(', ')}`);
      } else if (savedCount > 0) {
        commitWorkingToSaved();
        toast.success(`Saved ${savedCount} ${savedCount === 1 ? 'category' : 'categories'}`);
      } else {
        toast.info('No changes to save');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    resetWorkingValues();
    toast.success('Working changes discarded');
  };

  const handleApply = async () => {
    const password = window.prompt('Enter EZCONFIG_PASSWORD to apply config to game:');
    if (!password) return;

    setIsApplying(true);

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Applied config to game (${data.commandsSent} commands sent)`);
      } else {
        toast.error(`Failed to apply: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply config');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSave}
        disabled={!hasUnsavedChanges || isSaving}
        variant="default"
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            disabled={!hasUnsavedChanges}
            variant="destructive"
          >
            Reset Working Changes
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all working changes that haven't been saved. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        onClick={handleApply}
        disabled={hasUnsavedChanges || isApplying}
        variant="outline"
      >
        {isApplying ? 'Applying...' : 'Apply to Game'}
      </Button>
    </div>
  );
}
