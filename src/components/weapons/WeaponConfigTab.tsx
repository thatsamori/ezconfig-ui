"use client";

import { useEffect, useState } from "react";
import { WeaponAccordion } from "./WeaponAccordion";
import type { GroupedDatabase } from "@/lib/database/structure";

export function WeaponConfigTab() {
  const [weapons, setWeapons] = useState<GroupedDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <p className="text-destructive py-8 text-center">{error}</p>;
  }

  if (!weapons) {
    return <p className="text-muted-foreground py-8 text-center">Loading weapons...</p>;
  }

  return <WeaponAccordion weapons={weapons} />;
}
