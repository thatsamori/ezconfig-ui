"use client";

import { useState, useEffect } from "react";
import { useConfigStore, type ConfigValue } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
      // json.data is object: { "CanCombo": true, "Windup": 0.675 }
      for (const [key, value] of Object.entries(json.data)) {
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
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);

  // Subscribe to actual state values for reactivity
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);
  const loadedCategories = useConfigStore((state) => state.loadedCategories);

  // Load Movement category on mount since it's defaultOpen
  useEffect(() => {
    const loadInitialCategory = async () => {
      const category = CharacterConfigGroupName.Movement;
      if (!loadedCategories.has(`Character/${category}`)) {
        setLoadingCategory(category);
        await loadCharacterConfig(category);
        setLoadingCategory(null);
      }
    };
    loadInitialCategory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    const filteredOptions = showOverridesOnly
      ? options.filter((configEntry) =>
          getEffectiveValue(categoryName, configEntry.configKey) !== undefined
        )
      : options;

    // Hide empty sections when filter is ON
    if (showOverridesOnly && filteredOptions.length === 0) {
      return null;
    }

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
          filteredOptions.map((configEntry) => (
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
      <div className="flex items-center gap-2">
        <Switch
          id="character-overrides-toggle"
          checked={showOverridesOnly}
          onCheckedChange={setShowOverridesOnly}
        />
        <Label htmlFor="character-overrides-toggle" className="text-sm">
          Show overrides only
        </Label>
      </div>
      {renderSection(CharacterConfigGroupName.Movement, CHARACTER_CONFIG_OPTIONS.Movement, true)}
      {renderSection(CharacterConfigGroupName.Combat, CHARACTER_CONFIG_OPTIONS.Combat)}
      {renderSection(CharacterConfigGroupName.General, CHARACTER_CONFIG_OPTIONS.General)}
    </div>
  );
}
