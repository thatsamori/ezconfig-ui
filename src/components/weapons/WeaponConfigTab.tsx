"use client";

import { useEffect, useMemo, useState } from "react";
import { WeaponAccordion } from "./WeaponAccordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  const [overrideMap, setOverrideMap] = useState<GroupedOverrideMap | null>(null);

  // Fetch override map when showOverridesOnly becomes true
  useEffect(() => {
    if (showOverridesOnly && !overrideMap) {
      fetch("/api/databases/overrides")
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            // Always set overrideMap, defaulting to empty object if no Weapon data
            // This ensures filtering runs even when no saved weapon data exists
            setOverrideMap((json.data?.Weapon as GroupedOverrideMap) ?? {});
          }
        })
        .catch(console.error);
    }
  }, [showOverridesOnly, overrideMap]);

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

    // Filter by override presence when toggle is on and map is loaded
    if (showOverridesOnly && overrideMap) {
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
          overrideMap={showOverridesOnly && overrideMap ? overrideMap : undefined}
        />
      )}
    </div>
  );
}
