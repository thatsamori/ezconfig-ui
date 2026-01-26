"use client";

import { useEffect, useMemo, useState } from "react";
import { WeaponAccordion } from "./WeaponAccordion";
import { Input } from "@/components/ui/input";
import type { GroupedDatabase } from "@/lib/database/structure";

export function WeaponConfigTab() {
  const [weapons, setWeapons] = useState<GroupedDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter weapons based on search query (case-insensitive)
  const filteredWeapons = useMemo(() => {
    if (!weapons) return null;
    if (!searchQuery.trim()) return weapons;

    const query = searchQuery.toLowerCase();
    const filtered: GroupedDatabase = {};

    for (const [weaponName, categories] of Object.entries(weapons)) {
      if (weaponName.toLowerCase().includes(query)) {
        filtered[weaponName] = categories;
      }
    }

    return filtered;
  }, [weapons, searchQuery]);

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
      <Input
        placeholder="Search weapons..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {hasNoResults ? (
        <p className="text-muted-foreground py-8 text-center">
          No weapons match '{searchQuery}'
        </p>
      ) : (
        <WeaponAccordion weapons={filteredWeapons!} />
      )}
    </div>
  );
}
