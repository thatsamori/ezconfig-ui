"use client";

import { useMemo, useState, useEffect } from "react";
import { WeaponAccordion } from "./WeaponAccordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useConfigStore } from "@/lib/store/configStore";
import type { GroupedDatabase, GroupedOverrideMap } from "@/lib/database/structure";
import { CategoryName, WeaponConfigGroupName } from "@/lib/config/weaponConfigSchema";

// Build weapon list from schema - all weapons have the same categories
const ALL_CATEGORIES = [
  WeaponConfigGroupName.General,
  WeaponConfigGroupName.Strike,
  WeaponConfigGroupName.AltStrike,
  WeaponConfigGroupName.Stab,
  WeaponConfigGroupName.AltStab,
];

const SCHEMA_WEAPONS: GroupedDatabase = Object.fromEntries(
  Object.values(CategoryName).map((weaponName) => [weaponName, ALL_CATEGORIES])
);

export function WeaponConfigTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [configSearchQuery, setConfigSearchQuery] = useState("");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  const [serverOverrideMap, setServerOverrideMap] = useState<GroupedOverrideMap>({});

  // Get weapon values from store to compute override map
  const storeValues = useConfigStore((state) => state.values);

  // Fetch override map from server on mount
  useEffect(() => {
    async function fetchOverrides() {
      try {
        const res = await fetch("/api/databases/overrides");
        const json = await res.json();
        if (json.success && json.data) {
          // API returns { "Weapon": { weaponName: { category: bool } } }
          // We need to extract just the weapon data
          const weaponOverrides = json.data.Weapon || {};
          setServerOverrideMap(weaponOverrides as GroupedOverrideMap);
        }
      } catch (error) {
        console.error("Failed to fetch overrides:", error);
      }
    }
    fetchOverrides();
  }, []);

  // Compute override map from store state (for newly added overrides not yet on disk)
  const storeOverrideMap = useMemo<GroupedOverrideMap>(() => {
    const map: GroupedOverrideMap = {};
    for (const [weapon, categories] of Object.entries(storeValues.weapons)) {
      map[weapon] = {};
      for (const [category, entries] of Object.entries(categories)) {
        // Category has overrides if it has any entries
        map[weapon][category] = Object.keys(entries).length > 0;
      }
    }
    return map;
  }, [storeValues.weapons]);

  // Merge server and store override maps (store takes precedence for loaded weapons)
  const overrideMap = useMemo<GroupedOverrideMap>(() => {
    const merged: GroupedOverrideMap = { ...serverOverrideMap };
    // Merge in store overrides (these reflect current session changes)
    for (const [weapon, categories] of Object.entries(storeOverrideMap)) {
      if (!merged[weapon]) {
        merged[weapon] = {};
      }
      for (const [category, hasOverride] of Object.entries(categories)) {
        // Store value takes precedence (could be true if added, or false if cleared)
        merged[weapon][category] = hasOverride;
      }
    }
    return merged;
  }, [serverOverrideMap, storeOverrideMap]);

  // Filter weapons based on search query and override presence
  const filteredWeapons = useMemo(() => {
    let result = SCHEMA_WEAPONS;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = Object.fromEntries(
        Object.entries(result).filter(([name]) => name.toLowerCase().includes(query))
      );
    }

    // Filter by override presence when toggle is on
    if (showOverridesOnly) {
      result = Object.fromEntries(
        Object.entries(result).filter(([weaponName]) => {
          const weaponOverrides = overrideMap[weaponName];
          // Keep weapon if ANY category has overrides
          return weaponOverrides && Object.values(weaponOverrides).some(Boolean);
        })
      );
    }

    return result;
  }, [searchQuery, showOverridesOnly, overrideMap]);

  // Check if search yielded no results
  const hasNoResults = Object.keys(filteredWeapons).length === 0;

  return (
    <div className="space-y-4">
      {/* Sticky search bars */}
      <div className="sticky top-[105px] z-30 bg-background py-2 -mx-4 px-4 space-y-2">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search weapons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="overrides-toggle"
              checked={showOverridesOnly}
              onCheckedChange={setShowOverridesOnly}
            />
            <Label htmlFor="overrides-toggle" className="text-sm whitespace-nowrap">
              Show overrides only
            </Label>
          </div>
        </div>
        <Input
          placeholder="Search config options..."
          value={configSearchQuery}
          onChange={(e) => setConfigSearchQuery(e.target.value)}
        />
      </div>
      {hasNoResults ? (
        <p className="text-muted-foreground py-8 text-center">
          {searchQuery.trim()
            ? `No weapons match '${searchQuery}'`
            : showOverridesOnly
              ? "No weapons have overrides"
              : "No weapons found"}
        </p>
      ) : (
        <WeaponAccordion
          weapons={filteredWeapons}
          showOverridesOnly={showOverridesOnly}
          overrideMap={showOverridesOnly ? overrideMap : undefined}
          configSearchQuery={configSearchQuery}
        />
      )}
    </div>
  );
}
