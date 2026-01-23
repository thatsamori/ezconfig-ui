"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { WeaponName } from "@/lib/config/weaponConfigSchema";
import { useConfigStore } from "@/lib/store/configStore";
import { Label } from "@/components/ui/label";

export function WeaponSelector() {
  const selectedWeapons = useConfigStore((state) => state.selectedWeapons);
  const setSelectedWeapons = useConfigStore((state) => state.setSelectedWeapons);

  const allWeapons = Object.values(WeaponName);

  const handleWeaponToggle = (weapon: string, checked: boolean) => {
    if (checked) {
      setSelectedWeapons([...selectedWeapons, weapon]);
    } else {
      setSelectedWeapons(selectedWeapons.filter((w) => w !== weapon));
    }
  };

  return (
    <div className="flex flex-wrap gap-4">
      {allWeapons.map((weapon) => (
        <div key={weapon} className="flex items-center gap-2">
          <Checkbox
            id={`weapon-${weapon}`}
            checked={selectedWeapons.includes(weapon)}
            onCheckedChange={(checked) =>
              handleWeaponToggle(weapon, checked === true)
            }
          />
          <Label htmlFor={`weapon-${weapon}`} className="cursor-pointer">
            {weapon}
          </Label>
        </div>
      ))}
    </div>
  );
}
