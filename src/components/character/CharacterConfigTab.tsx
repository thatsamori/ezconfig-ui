"use client";

import { useConfigStore } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";

/**
 * CharacterConfigTab - Temporary v0.1 compatibility implementation
 *
 * This component uses deprecated store API (characterValues, setCharacterValue).
 * Will be refactored to use new store model in Phase 6 Plan 03.
 */
export function CharacterConfigTab() {
  const characterValues = useConfigStore((state) => state.characterValues);
  const setCharacterValue = useConfigStore((state) => state.setCharacterValue);

  return (
    <div className="space-y-4 mt-4">
      <CollapsibleSection title={CharacterConfigGroupName.Movement} defaultOpen>
        {CHARACTER_CONFIG_OPTIONS.Movement.map((configEntry) => (
          <ConfigRow
            key={configEntry.configKey}
            configEntry={configEntry}
            value={characterValues[configEntry.configKey]}
            onChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
          />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title={CharacterConfigGroupName.Combat}>
        {CHARACTER_CONFIG_OPTIONS.Combat.map((configEntry) => (
          <ConfigRow
            key={configEntry.configKey}
            configEntry={configEntry}
            value={characterValues[configEntry.configKey]}
            onChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
          />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title={CharacterConfigGroupName.General}>
        {CHARACTER_CONFIG_OPTIONS.General.map((configEntry) => (
          <ConfigRow
            key={configEntry.configKey}
            configEntry={configEntry}
            value={characterValues[configEntry.configKey]}
            onChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
          />
        ))}
      </CollapsibleSection>
    </div>
  );
}
