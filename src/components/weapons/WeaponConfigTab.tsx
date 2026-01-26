"use client";

import { useEffect, useMemo, useState } from "react";
import { WeaponAccordion } from "./WeaponAccordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { GroupedDatabase, GroupedOverrideMap } from "@/lib/database/structure";

export function WeaponConfigTab() {
  const [weapons, setWeapons] = useState<GroupedDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  const [overrideMap, setOverrideMap] = useState<GroupedOverrideMap | null>(null);

  useEffect(() => {
    async function loadStructure() {
      try {
        const res = await fetch("/api/databases");
        const json = await res.json();
        if (json.success && json.data?.Weapon) {
          setWeapons(json.data.Weapon as GroupedDatabase);
        } else {
          setError("Failed to load weapon list");
        }
      } catch (e) {
        setError("Failed to load weapon list");
      }
    }
    loadStructure();
  }, []);

  // Fetch override map when showOverridesOnly becomes true
  useEffect(() => {
    if (showOverridesOnly && !overrideMap) {
      fetch("/api/databases/overrides")
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data?.Weapon) {
            setOverrideMap(json.data.Weapon as GroupedOverrideMap);
          }
        })
        .catch(console.error);
    }
  }, [showOverridesOnly, overrideMap]);

  // Filter weapons based on search query and override presence
  const filteredWeapons = useMemo(() => {
    if (!weapons) return null;

    let result = weapons;

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
  }, [weapons, searchQuery, showOverridesOnly, overrideMap]);

  if (error) {
    return <p className="text-destructive py-8 text-center">{error}</p>;
  }

  if (!weapons) {
    return <p className="text-muted-foreground py-8 text-center">Loading weapons...</p>;
  }

  // Check if search yielded no results (only when weapons are loaded but none match)
  const hasNoResults = filteredWeapons && Object.keys(filteredWeapons).length === 0;

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
          No weapons match '{searchQuery}'
        </p>
      ) : (
        <WeaponAccordion
          weapons={filteredWeapons!}
          showOverridesOnly={showOverridesOnly}
          overrideMap={showOverridesOnly && overrideMap ? overrideMap : undefined}
        />
      )}
    </div>
  );
}
