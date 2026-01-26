"use client";

import { useState } from "react";
import { useConfigStore, type ConfigValue } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";
import type { ConfigEntry } from "@/lib/config/types";

// Lazy load character config from API
async function loadCharacterConfig(category: string) {
  const { setSavedValue, markCategoryLoaded, isCategoryLoaded } =
    useConfigStore.getState();

  const path = `Character/${category}`;
  if (isCategoryLoaded(path)) return;

  try {
    const res = await fetch(`/api/config/Character/${category}`);
    const json = await res.json();

    if (json.success && json.data) {
      // json.data is array of single-key objects: [{ "CanCombo": true }, { "Windup": 0.675 }]
      for (const entry of json.data) {
        const [key, value] = Object.entries(entry)[0];
        setSavedValue("Character", category, key, value as ConfigValue);
      }
    }

    markCategoryLoaded(path);
  } catch (error) {
    console.error(`Failed to load config for ${path}:`, error);
    // Mark as loaded to prevent infinite retry loops
    markCategoryLoaded(path);
  }
}

export function CharacterConfigTab() {
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);

  // Subscribe to actual state values for reactivity
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);
  const loadedCategories = useConfigStore((state) => state.loadedCategories);

  // Get action functions
  const setWorkingValue = useConfigStore((state) => state.setWorkingValue);
  const removeWorkingValue = useConfigStore((state) => state.removeWorkingValue);

  // Helper to check if category is loaded
  const isCategoryLoaded = (category: string) =>
    loadedCategories.has(`Character/${category}`);

  // Helper to get effective value (working ?? saved)
  // null is a tombstone meaning "reset to game default"
  const getEffectiveValue = (category: string, key: string) => {
    const workingVal = workingValues.character[category]?.[key];
    if (workingVal === null) return undefined; // Tombstone = game default
    if (workingVal !== undefined) return workingVal;
    return savedValues.character[category]?.[key];
  };

  // Handle section expand - trigger lazy load if needed
  const handleSectionOpen = async (category: string, open: boolean) => {
    if (open && !isCategoryLoaded(category)) {
      setLoadingCategory(category);
      await loadCharacterConfig(category);
      setLoadingCategory(null);
    }
  };

  const renderSection = (
    categoryName: string,
    options: ConfigEntry[],
    defaultOpen: boolean = false
  ) => {
    const isLoading = loadingCategory === categoryName;

    return (
      <CollapsibleSection
        key={categoryName}
        title={categoryName}
        defaultOpen={defaultOpen}
        onOpenChange={(open) => handleSectionOpen(categoryName, open)}
      >
        {isLoading ? (
          <p className="text-muted-foreground py-4 text-center">
            Loading {categoryName} configuration...
          </p>
        ) : (
          options.map((configEntry) => (
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
          ))
        )}
      </CollapsibleSection>
    );
  };

  return (
    <div className="space-y-4 mt-4">
      {renderSection(CharacterConfigGroupName.Movement, CHARACTER_CONFIG_OPTIONS.Movement, true)}
      {renderSection(CharacterConfigGroupName.Combat, CHARACTER_CONFIG_OPTIONS.Combat)}
      {renderSection(CharacterConfigGroupName.General, CHARACTER_CONFIG_OPTIONS.General)}
    </div>
  );
}
