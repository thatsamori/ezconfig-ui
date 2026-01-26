"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CollapsibleSection } from "./CollapsibleSection";
import { ConfigRow } from "./ConfigRow";
import { useConfigStore, type ConfigValue } from "@/lib/store/configStore";
import {
  WEAPON_CONFIG_OPTIONS,
  WeaponConfigGroupName,
} from "@/lib/config/weaponConfigSchema";
import type { GroupedDatabase } from "@/lib/database/structure";
import type { ConfigEntry } from "@/lib/config/types";

interface WeaponAccordionProps {
  weapons: GroupedDatabase; // { Greatsword: ["General", "Strike", ...], ... }
}

// Get config options for a category
function getConfigOptions(category: string): ConfigEntry[] {
  if (category === WeaponConfigGroupName.General) {
    return WEAPON_CONFIG_OPTIONS.General;
  }
  // Attack types (Strike, AltStrike, Stab, AltStab) use the Attack options
  return WEAPON_CONFIG_OPTIONS.Attack;
}

// Lazy load weapon config from API
async function loadWeaponConfig(weaponName: string, categories: string[]) {
  const { setSavedValue, markCategoryLoaded, isCategoryLoaded } =
    useConfigStore.getState();

  for (const category of categories) {
    const path = `${weaponName}/${category}`;
    if (isCategoryLoaded(path)) continue;

    try {
      const res = await fetch(`/api/config/${weaponName}/${category}`);
      const json = await res.json();

      if (json.success && json.data) {
        // json.data is array of single-key objects: [{ "CanCombo": true }, { "Windup": 0.675 }]
        for (const entry of json.data) {
          const [key, value] = Object.entries(entry)[0];
          setSavedValue(weaponName, category, key, value as ConfigValue);
        }
      }

      markCategoryLoaded(path);
    } catch (error) {
      console.error(`Failed to load config for ${path}:`, error);
      // Mark as loaded to prevent infinite retry loops
      markCategoryLoaded(path);
    }
  }
}

export function WeaponAccordion({ weapons }: WeaponAccordionProps) {
  const [expandedWeapon, setExpandedWeapon] = useState<string | undefined>(
    undefined
  );
  const [loadingWeapon, setLoadingWeapon] = useState<string | null>(null);

  // Subscribe to actual state values to trigger re-renders
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);
  const loadedCategories = useConfigStore((state) => state.loadedCategories);

  // Get action functions (these don't need to trigger re-renders)
  const setWorkingValue = useConfigStore((state) => state.setWorkingValue);
  const removeWorkingValue = useConfigStore((state) => state.removeWorkingValue);

  // Helper to get effective value (working ?? saved)
  const getEffectiveValue = (weaponName: string, category: string, key: string) => {
    const workingVal = workingValues.weapons[weaponName]?.[category]?.[key];
    if (workingVal !== undefined) return workingVal;
    return savedValues.weapons[weaponName]?.[category]?.[key];
  };

  // Helper to check if category is loaded
  const isCategoryLoaded = (path: string) => loadedCategories.has(path);

  const handleAccordionChange = async (value: string) => {
    setExpandedWeapon(value || undefined);

    if (value) {
      const weaponName = value;
      const categories = weapons[weaponName];

      if (categories) {
        // Check if any category needs loading
        const needsLoading = categories.some(
          (cat) => !isCategoryLoaded(`${weaponName}/${cat}`)
        );

        if (needsLoading) {
          setLoadingWeapon(weaponName);
          await loadWeaponConfig(weaponName, categories);
          setLoadingWeapon(null);
        }
      }
    }
  };

  const weaponNames = Object.keys(weapons).sort();

  const renderConfigSection = (
    weaponName: string,
    category: string,
    defaultOpen: boolean
  ) => {
    const options = getConfigOptions(category);

    return (
      <CollapsibleSection
        key={`${weaponName}-${category}`}
        title={category}
        defaultOpen={defaultOpen}
      >
        {options.map((configEntry) => (
          <ConfigRow
            key={`${weaponName}-${category}-${configEntry.configKey}`}
            configEntry={configEntry}
            value={getEffectiveValue(weaponName, category, configEntry.configKey)}
            onChange={(value) =>
              setWorkingValue(weaponName, category, configEntry.configKey, value)
            }
            onReset={() =>
              removeWorkingValue(weaponName, category, configEntry.configKey)
            }
          />
        ))}
      </CollapsibleSection>
    );
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={expandedWeapon}
      onValueChange={handleAccordionChange}
      className="w-full"
    >
      {weaponNames.map((weaponName) => {
        const categories = weapons[weaponName];
        const isLoading = loadingWeapon === weaponName;
        const isExpanded = expandedWeapon === weaponName;

        return (
          <AccordionItem key={weaponName} value={weaponName}>
            <AccordionTrigger className="px-4 text-base font-semibold">
              {weaponName}
            </AccordionTrigger>
            <AccordionContent className="px-4">
              {isLoading ? (
                <p className="text-muted-foreground py-4 text-center">
                  Loading {weaponName} configuration...
                </p>
              ) : isExpanded ? (
                <div className="space-y-2">
                  {categories.map((category, index) =>
                    renderConfigSection(weaponName, category, index === 0)
                  )}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
