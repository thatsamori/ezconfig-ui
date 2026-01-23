"use client";

import { useConfigStore } from "@/lib/store/configStore";
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
} from "@/lib/config/characterConfigSchema";
import { ConfigRow } from "@/components/weapons/ConfigRow";
import { CollapsibleSection } from "@/components/weapons/CollapsibleSection";

export function CharacterConfigTab() {
  const characterValues = useConfigStore((state) => state.characterValues);
  const characterStaged = useConfigStore((state) => state.characterStaged);
  const setCharacterValue = useConfigStore((state) => state.setCharacterValue);
  const setCharacterStaged = useConfigStore((state) => state.setCharacterStaged);

  return (
    <div className="space-y-4 mt-4">
      <CollapsibleSection title={CharacterConfigGroupName.Movement} defaultOpen>
        {CHARACTER_CONFIG_OPTIONS.Movement.map((configEntry) => (
          <ConfigRow
            key={configEntry.configKey}
            configEntry={configEntry}
            value={characterValues[configEntry.configKey]}
            staged={characterStaged[configEntry.configKey] ?? false}
            onValueChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
            onStagedChange={(staged) =>
              setCharacterStaged(configEntry.configKey, staged)
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
            staged={characterStaged[configEntry.configKey] ?? false}
            onValueChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
            onStagedChange={(staged) =>
              setCharacterStaged(configEntry.configKey, staged)
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
            staged={characterStaged[configEntry.configKey] ?? false}
            onValueChange={(value) =>
              setCharacterValue(configEntry.configKey, value)
            }
            onStagedChange={(staged) =>
              setCharacterStaged(configEntry.configKey, staged)
            }
          />
        ))}
      </CollapsibleSection>
    </div>
  );
}
