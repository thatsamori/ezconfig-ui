"use client";

import { useConfigStore } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";
import type { ConfigEntry } from "@/lib/config/types";

export function CharacterConfigTab() {
  // Subscribe to actual state values for reactivity
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);

  // Get action functions
  const setWorkingValue = useConfigStore((state) => state.setWorkingValue);
  const removeWorkingValue = useConfigStore((state) => state.removeWorkingValue);

  // Helper to get effective value (working ?? saved)
  const getEffectiveValue = (category: string, key: string) => {
    const workingVal = workingValues.character[category]?.[key];
    if (workingVal !== undefined) return workingVal;
    return savedValues.character[category]?.[key];
  };

  const renderSection = (
    categoryName: string,
    options: ConfigEntry[],
    defaultOpen: boolean = false
  ) => (
    <CollapsibleSection title={categoryName} defaultOpen={defaultOpen}>
      {options.map((configEntry) => (
        <ConfigRow
          key={configEntry.configKey}
          configEntry={configEntry}
          value={getEffectiveValue(categoryName, configEntry.configKey)}
          onChange={(value) =>
            setWorkingValue("Character", categoryName, configEntry.configKey, value)
          }
          onReset={() =>
            removeWorkingValue("Character", categoryName, configEntry.configKey)
          }
        />
      ))}
    </CollapsibleSection>
  );

  return (
    <div className="space-y-4 mt-4">
      {renderSection(CharacterConfigGroupName.Movement, CHARACTER_CONFIG_OPTIONS.Movement, true)}
      {renderSection(CharacterConfigGroupName.Combat, CHARACTER_CONFIG_OPTIONS.Combat)}
      {renderSection(CharacterConfigGroupName.General, CHARACTER_CONFIG_OPTIONS.General)}
    </div>
  );
}
