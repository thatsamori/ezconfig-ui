'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/lib/store/configStore';
import { applyConfigChanges } from '@/app/actions/rcon';
import { loadGameIniConfig } from '@/app/actions/gameini';
import { toast } from 'sonner';

export function ApplyChangesButton() {
  const [isApplying, setIsApplying] = useState(false);
  const getStagedChanges = useConfigStore((state) => state.getStagedChanges);
  const initializeFromGameIni = useConfigStore((state) => state.initializeFromGameIni);

  // Subscribe to staged state to trigger re-renders when staged changes
  const characterStaged = useConfigStore((state) => state.characterStaged);
  const weaponStaged = useConfigStore((state) => state.weaponStaged);

  // Calculate the count of staged changes (for display only)
  const characterCount = Object.values(characterStaged).filter(Boolean).length;
  const weaponCount = Object.values(weaponStaged).reduce(
    (acc, configs) => Object.values(configs).filter(Boolean).length + acc,
    0
  );
  const totalCount = characterCount + weaponCount;

  const handleApply = async () => {
    // Get fresh staged changes at time of apply (includes current values)
    const stagedChanges = getStagedChanges();
    const count = Object.keys(stagedChanges.character).length +
      Object.values(stagedChanges.weapons).reduce(
        (acc, configs) => acc + Object.keys(configs).length,
        0
      );

    if (count === 0) return;

    setIsApplying(true);

    try {
      // Apply changes via RCON
      const result = await applyConfigChanges(stagedChanges);

      if (result.success) {
        if (result.commandCount === 0) {
          toast.info('No changes to apply');
        } else {
          toast.success(`Applied ${result.commandCount} config changes`);
        }

        // Small delay to allow Game.ini to be updated by the mod
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Refresh state from Game.ini
        const refreshResult = await loadGameIniConfig();
        if (refreshResult.success) {
          initializeFromGameIni(refreshResult.data.characterValues, refreshResult.data.weaponValues);
        } else {
          console.warn('Failed to refresh Game.ini after apply:', refreshResult.error);
        }
      } else {
        toast.error(`Failed to apply changes: ${result.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsApplying(false);
    }
  };

  const buttonText = isApplying
    ? 'Applying...'
    : totalCount > 0
      ? `Apply ${totalCount} Change${totalCount !== 1 ? 's' : ''}`
      : 'Apply Changes';

  return (
    <Button onClick={handleApply} disabled={totalCount === 0 || isApplying}>
      {buttonText}
    </Button>
  );
}
