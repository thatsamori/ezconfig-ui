"use client";

import { WeaponSelector } from "./WeaponSelector";
import { ConfigRow } from "./ConfigRow";
import { CollapsibleSection } from "./CollapsibleSection";
import { useConfigStore } from "@/lib/store/configStore";
import {
  WEAPON_CONFIG_OPTIONS,
  WeaponConfigGroupName,
} from "@/lib/config/weaponConfigSchema";
import { ConfigEntry } from "@/lib/config/types";

// Get attack config options for attack groups
const getConfigOptions = (group: WeaponConfigGroupName): ConfigEntry[] => {
  if (group === WeaponConfigGroupName.General) {
    return WEAPON_CONFIG_OPTIONS.General;
  }
  // Attack types (Strike, AltStrike, Stab, AltStab) use the Attack options
  return WEAPON_CONFIG_OPTIONS.Attack;
};

export function WeaponConfigTab() {
  const selectedWeapons = useConfigStore((state) => state.selectedWeapons);
  const weaponValues = useConfigStore((state) => state.weaponValues);
  const weaponStaged = useConfigStore((state) => state.weaponStaged);
  const setWeaponValue = useConfigStore((state) => state.setWeaponValue);
  const setWeaponStaged = useConfigStore((state) => state.setWeaponStaged);

  // Get value from the first selected weapon for display
  const getValue = (group: WeaponConfigGroupName, configKey: string) => {
    if (selectedWeapons.length === 0) return undefined;
    const firstWeapon = selectedWeapons[0];
    // Build the full key including group for non-General groups
    const fullKey = group === WeaponConfigGroupName.General
      ? `General_${configKey}`
      : `${group}_${configKey}`;
    return weaponValues[firstWeapon]?.[fullKey];
  };

  // Get staged state from the first selected weapon
  const getStaged = (group: WeaponConfigGroupName, configKey: string) => {
    if (selectedWeapons.length === 0) return false;
    const firstWeapon = selectedWeapons[0];
    const fullKey = group === WeaponConfigGroupName.General
      ? `General_${configKey}`
      : `${group}_${configKey}`;
    return weaponStaged[firstWeapon]?.[fullKey] ?? false;
  };

  // Handle value change for all selected weapons
  const handleValueChange = (
    group: WeaponConfigGroupName,
    configKey: string,
    value: any
  ) => {
    const fullKey = group === WeaponConfigGroupName.General
      ? `General_${configKey}`
      : `${group}_${configKey}`;
    for (const weapon of selectedWeapons) {
      setWeaponValue(weapon, fullKey, value);
    }
  };

  // Handle staged change for all selected weapons
  const handleStagedChange = (
    group: WeaponConfigGroupName,
    configKey: string,
    staged: boolean
  ) => {
    const fullKey = group === WeaponConfigGroupName.General
      ? `General_${configKey}`
      : `${group}_${configKey}`;
    for (const weapon of selectedWeapons) {
      setWeaponStaged(weapon, fullKey, staged);
    }
  };

  const renderSection = (group: WeaponConfigGroupName, defaultOpen: boolean) => {
    const options = getConfigOptions(group);

    return (
      <CollapsibleSection
        key={group}
        title={group}
        defaultOpen={defaultOpen}
      >
        {options.map((configEntry) => (
          <ConfigRow
            key={`${group}_${configEntry.configKey}`}
            configEntry={configEntry}
            value={getValue(group, configEntry.configKey)}
            staged={getStaged(group, configEntry.configKey)}
            onValueChange={(value) =>
              handleValueChange(group, configEntry.configKey, value)
            }
            onStagedChange={(staged) =>
              handleStagedChange(group, configEntry.configKey, staged)
            }
            disabled={selectedWeapons.length === 0}
          />
        ))}
      </CollapsibleSection>
    );
  };

  return (
    <div className="space-y-6">
      <WeaponSelector />

      {selectedWeapons.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          Select a weapon to configure
        </p>
      ) : (
        <div className="mt-6">
          {renderSection(WeaponConfigGroupName.General, true)}
          {renderSection(WeaponConfigGroupName.Strike, false)}
          {renderSection(WeaponConfigGroupName.AltStrike, false)}
          {renderSection(WeaponConfigGroupName.Stab, false)}
          {renderSection(WeaponConfigGroupName.AltStab, false)}
        </div>
      )}
    </div>
  );
}
