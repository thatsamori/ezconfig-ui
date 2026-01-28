"use client";

import { useState, useEffect } from "react";
import { useConfigStore, type ConfigValue } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";
import { Input } from "@/components/ui/input";
import type { ConfigEntry } from "@/lib/config/types";

// Lazy load character config from API
async function loadCharacterConfig(category: string) {
  const { setValue, markCategoryLoaded, isCategoryLoaded } =
    useConfigStore.getState();

  const path = `Character/${category}`;
  if (isCategoryLoaded(path)) return;

  try {
    const res = await fetch(`/api/config/Character/${category}`);
    const json = await res.json();

    if (json.success && json.data) {
      // json.data is object: { "CanCombo": true, "Windup": 0.675 }
      for (const [key, value] of Object.entries(json.data)) {
        setValue("Character", category, key, value as ConfigValue);
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
  const [configSearchQuery, setConfigSearchQuery] = useState("");

  // Subscribe to actual state values for reactivity
  const values = useConfigStore((state) => state.values);
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
  const setValue = useConfigStore((state) => state.setValue);
  const removeValue = useConfigStore((state) => state.removeValue);

  // Helper to check if category is loaded
  const isCategoryLoaded = (category: string) =>
    loadedCategories.has(`Character/${category}`);

  // Helper to get value from store
  const getEffectiveValue = (category: string, key: string) => {
    return values.character[category]?.[key];
  };

  // Handle section expand - trigger lazy load if needed
  const handleSectionOpen = async (category: string, open: boolean) => {
    if (open && !isCategoryLoaded(category)) {
      setLoadingCategory(category);
      await loadCharacterConfig(category);
      setLoadingCategory(null);
    }
  };

  // Filter options by config search query
  const filterOptionsBySearch = (options: ConfigEntry[]) => {
    if (!configSearchQuery.trim()) return options;
    const query = configSearchQuery.toLowerCase();
    return options.filter((entry) =>
      entry.configKey.toLowerCase().includes(query)
    );
  };

  const renderSection = (
    categoryName: string,
    options: ConfigEntry[],
    defaultOpen: boolean = false
  ) => {
    const isLoading = loadingCategory === categoryName;
    const filteredOptions = filterOptionsBySearch(options);

    // Hide sections with no matching options
    if (filteredOptions.length === 0) {
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
              database="Character"
              category={categoryName}
              value={getEffectiveValue(categoryName, configEntry.configKey)}
              onChange={(value) =>
                setValue("Character", categoryName, configEntry.configKey, value)
              }
              onReset={() =>
                removeValue("Character", categoryName, configEntry.configKey)
              }
            />
          ))
        )}
      </CollapsibleSection>
    );
  };

  // Check if any section will be rendered
  const movementSection = renderSection(CharacterConfigGroupName.Movement, CHARACTER_CONFIG_OPTIONS.Movement, true);
  const combatSection = renderSection(CharacterConfigGroupName.Combat, CHARACTER_CONFIG_OPTIONS.Combat);
  const generalSection = renderSection(CharacterConfigGroupName.General, CHARACTER_CONFIG_OPTIONS.General);
  const hasVisibleSections = movementSection || combatSection || generalSection;

  return (
    <div className="space-y-4">
      {/* Sticky search bar */}
      <div className="sticky top-[105px] z-30 bg-background py-2 -mx-4 px-4">
        <Input
          placeholder="Search config options..."
          value={configSearchQuery}
          onChange={(e) => setConfigSearchQuery(e.target.value)}
        />
      </div>
      {!hasVisibleSections ? (
        <p className="text-muted-foreground py-8 text-center">
          {configSearchQuery.trim()
            ? `No config options match '${configSearchQuery}'`
            : "No config options found"}
        </p>
      ) : (
        <>
          {movementSection}
          {combatSection}
          {generalSection}
        </>
      )}
    </div>
  );
}
