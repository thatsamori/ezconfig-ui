"use client";

import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CollapsibleSection } from "./CollapsibleSection";
import { ConfigRow } from "./ConfigRow";
import { useConfigStore, type ConfigValue } from "@/lib/store/configStore";
import { useAuthStore } from "@/lib/store/authStore";
import { canEditConfig } from "@/lib/auth";
import {
  WEAPON_CONFIG_OPTIONS,
  WeaponConfigGroupName,
} from "@/lib/config/weaponConfigSchema";
import type { GroupedDatabase } from "@/lib/database/structure";
import type { ConfigEntry } from "@/lib/config/types";

// Type for pending bulk action
interface PendingBulkAction {
  category: string;
  key: string;
  value: ConfigValue;
}

interface WeaponAccordionProps {
  weapons: GroupedDatabase; // { Greatsword: ["General", "Strike", ...], ... }
  showOverridesOnly?: boolean;
  overrideMap?: Record<string, Record<string, boolean>>; // { Greatsword: { General: true, Strike: false }, ... }
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
        // json.data is object: { "CanCombo": true, "Windup": 0.675 }
        for (const [key, value] of Object.entries(json.data)) {
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

export function WeaponAccordion({ weapons, showOverridesOnly = false, overrideMap }: WeaponAccordionProps) {
  const [expandedWeapon, setExpandedWeapon] = useState<string | undefined>(
    undefined
  );
  const [loadingWeapon, setLoadingWeapon] = useState<string | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<PendingBulkAction | null>(null);
  const [mounted, setMounted] = useState(false);

  // Wait for client mount to avoid Radix UI hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Subscribe to actual state values to trigger re-renders
  const workingValues = useConfigStore((state) => state.workingValues);
  const savedValues = useConfigStore((state) => state.savedValues);
  const loadedCategories = useConfigStore((state) => state.loadedCategories);

  // Get user for role-based access control
  const user = useAuthStore((state) => state.user);
  const isReadonly = !canEditConfig(user?.role);

  // Get action functions (these don't need to trigger re-renders)
  const setWorkingValue = useConfigStore((state) => state.setWorkingValue);
  const removeWorkingValue = useConfigStore((state) => state.removeWorkingValue);
  const setBulkWeaponValue = useConfigStore((state) => state.setBulkWeaponValue);

  // Helper to get effective value (working ?? saved)
  // null is a tombstone meaning "reset to game default"
  const getEffectiveValue = (weaponName: string, category: string, key: string) => {
    const workingVal = workingValues.weapons[weaponName]?.[category]?.[key];
    if (workingVal === null) return undefined; // Tombstone = game default
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

  // Handler to initiate bulk apply action
  const handleApplyToAll = (category: string, key: string, value: ConfigValue) => {
    setPendingBulkAction({ category, key, value });
  };

  // Confirm bulk apply action
  const confirmBulkApply = () => {
    if (pendingBulkAction) {
      setBulkWeaponValue(
        pendingBulkAction.category,
        pendingBulkAction.key,
        pendingBulkAction.value,
        weaponNames
      );
      setPendingBulkAction(null);
    }
  };

  // Format value for display in confirmation dialog
  const formatValue = (value: ConfigValue): string => {
    if (value === null) return "Game Default";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return `[${value.join(", ")}]`;
    if (typeof value === "object") {
      if ("z" in value) {
        return `{x: ${value.x}, y: ${value.y}, z: ${value.z}}`;
      }
      return `{x: ${value.x}, y: ${value.y}}`;
    }
    return String(value);
  };

  const renderConfigSection = (
    weaponName: string,
    category: string,
    defaultOpen: boolean
  ) => {
    const options = getConfigOptions(category);

    const filteredOptions = showOverridesOnly
      ? options.filter((configEntry) =>
          getEffectiveValue(weaponName, category, configEntry.configKey) !== undefined
        )
      : options;

    return (
      <CollapsibleSection
        key={`${weaponName}-${category}`}
        title={category}
        defaultOpen={defaultOpen}
      >
        {filteredOptions.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm italic">
            No overrides in {category}
          </p>
        ) : (
          filteredOptions.map((configEntry) => {
            const effectiveValue = getEffectiveValue(weaponName, category, configEntry.configKey);
            return (
              <ConfigRow
                key={`${weaponName}-${category}-${configEntry.configKey}`}
                configEntry={configEntry}
                value={effectiveValue}
                onChange={(value) =>
                  setWorkingValue(weaponName, category, configEntry.configKey, value)
                }
                onReset={() =>
                  removeWorkingValue(weaponName, category, configEntry.configKey)
                }
                onApplyToAll={() =>
                  handleApplyToAll(
                    category,
                    configEntry.configKey,
                    effectiveValue !== undefined ? effectiveValue : null
                  )
                }
                readonly={isReadonly}
              />
            );
          })
        )}
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
                  {categories
                    .filter((category) => {
                      // When override map available, filter categories with no overrides
                      if (showOverridesOnly && overrideMap) {
                        return overrideMap[weaponName]?.[category] === true;
                      }
                      return true;
                    })
                    .map((category, index) =>
                      renderConfigSection(weaponName, category, index === 0)
                    )}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        );
      })}

      {/* Bulk apply confirmation dialog */}
      {mounted && (
        <AlertDialog
          open={pendingBulkAction !== null}
          onOpenChange={(open) => !open && setPendingBulkAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingBulkAction?.value === null
                  ? "Reset all weapons to default?"
                  : "Apply to all weapons?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will set <strong>{pendingBulkAction?.key}</strong> to{" "}
                <strong>{pendingBulkAction ? formatValue(pendingBulkAction.value) : ""}</strong>{" "}
                for all {weaponNames.length} weapons. This change will be saved to your working state.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmBulkApply}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Accordion>
  );
}
