'use server';

import { validateEnv } from '@/lib/env';
import { executeBatchCommands } from '@/lib/rcon/service';
import { formatValue } from '@/lib/rcon/formatters';
import { DataType, type ConfigEntry } from '@/lib/config/types';
import {
  CHARACTER_CONFIG_OPTIONS,
  CharacterConfigGroupName,
  characterConfigFlatMap,
} from '@/lib/config/characterConfigSchema';
import {
  WEAPON_CONFIG_OPTIONS,
  WeaponConfigGroupName,
  weaponConfigFlatMap,
} from '@/lib/config/weaponConfigSchema';

// Type for staged changes from the config store
export type StagedChanges = {
  character: Record<string, unknown>;
  weapons: Record<string, Record<string, unknown>>;
};

// Discriminated union for result type
export type ApplyConfigResult =
  | {
      success: true;
      commandCount: number;
      responses: string[];
    }
  | {
      success: false;
      error: string;
    };

// Attack type prefixes that map to weapon groups
const ATTACK_PREFIXES = ['Strike', 'AltStrike', 'Stab', 'AltStab'] as const;

/**
 * Find the group name for a character config key
 */
function findCharacterGroupName(configKey: string): CharacterConfigGroupName | null {
  for (const [groupName, configs] of Object.entries(CHARACTER_CONFIG_OPTIONS)) {
    if (configs.some((config) => config.configKey === configKey)) {
      return groupName as CharacterConfigGroupName;
    }
  }
  return null;
}

/**
 * Parse a weapon config key to extract group name and base config key
 * Weapon keys may be prefixed with attack type: "Strike_CanCombo" -> { group: "Strike", key: "CanCombo" }
 * Or prefixed with General: "General_IsParryHeld" -> { group: "General", key: "IsParryHeld" }
 */
function parseWeaponConfigKey(fullKey: string): { groupName: WeaponConfigGroupName; configKey: string } | null {
  // Check if it has an attack prefix
  for (const prefix of ATTACK_PREFIXES) {
    if (fullKey.startsWith(`${prefix}_`)) {
      const configKey = fullKey.substring(prefix.length + 1);
      // Verify this is a valid Attack config key
      const attackConfigs = WEAPON_CONFIG_OPTIONS.Attack;
      if (attackConfigs.some((config) => config.configKey === configKey)) {
        return {
          groupName: prefix as WeaponConfigGroupName,
          configKey,
        };
      }
    }
  }

  // Check if it has a General_ prefix
  if (fullKey.startsWith('General_')) {
    const configKey = fullKey.substring('General_'.length);
    const generalConfigs = WEAPON_CONFIG_OPTIONS.General;
    if (generalConfigs.some((config) => config.configKey === configKey)) {
      return {
        groupName: WeaponConfigGroupName.General,
        configKey,
      };
    }
  }

  return null;
}

/**
 * Get config entry from flat maps
 */
function getConfigEntry(configKey: string, isWeapon: boolean): ConfigEntry | null {
  if (isWeapon) {
    return (weaponConfigFlatMap as Record<string, ConfigEntry>)[configKey] ?? null;
  }
  return (characterConfigFlatMap as Record<string, ConfigEntry>)[configKey] ?? null;
}

/**
 * Build RCON command for a character config update
 * Format: string ezconfig Character {GroupName} {ConfigKey} {FormattedValue}
 */
function buildCharacterCommand(
  groupName: CharacterConfigGroupName,
  configKey: string,
  value: unknown,
  dataType: DataType
): string {
  const formattedValue = formatValue(dataType, value);
  return `string ezconfig Character ${groupName} ${configKey} ${formattedValue}`;
}

/**
 * Build RCON command for a weapon config update
 * Format: string ezconfig {WeaponName} {GroupName} {ConfigKey} {FormattedValue}
 */
function buildWeaponCommand(
  weaponName: string,
  groupName: WeaponConfigGroupName,
  configKey: string,
  value: unknown,
  dataType: DataType
): string {
  const formattedValue = formatValue(dataType, value);
  return `string ezconfig ${weaponName} ${groupName} ${configKey} ${formattedValue}`;
}

/**
 * Apply staged config changes via RCON commands
 */
export async function applyConfigChanges(stagedChanges: StagedChanges): Promise<ApplyConfigResult> {
  // Validate environment
  try {
    validateEnv();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Environment validation failed',
    };
  }

  const commands: string[] = [];

  // Build character config commands
  for (const [configKey, value] of Object.entries(stagedChanges.character)) {
    const groupName = findCharacterGroupName(configKey);
    if (!groupName) {
      console.warn(`Unknown character config key: ${configKey}`);
      continue;
    }

    const configEntry = getConfigEntry(configKey, false);
    if (!configEntry) {
      console.warn(`No config entry found for character key: ${configKey}`);
      continue;
    }

    const command = buildCharacterCommand(groupName, configKey, value, configEntry.dataType);
    commands.push(command);
  }

  // Build weapon config commands
  for (const [weaponName, configs] of Object.entries(stagedChanges.weapons)) {
    for (const [fullKey, value] of Object.entries(configs)) {
      const parsed = parseWeaponConfigKey(fullKey);
      if (!parsed) {
        console.warn(`Unknown weapon config key: ${fullKey}`);
        continue;
      }

      const { groupName, configKey } = parsed;
      const configEntry = getConfigEntry(configKey, true);
      if (!configEntry) {
        console.warn(`No config entry found for weapon key: ${configKey}`);
        continue;
      }

      const command = buildWeaponCommand(weaponName, groupName, configKey, value, configEntry.dataType);
      commands.push(command);
    }
  }

  if (commands.length === 0) {
    return {
      success: true,
      commandCount: 0,
      responses: [],
    };
  }

  // Execute all commands via RCON
  try {
    const responses = await executeBatchCommands(commands);
    return {
      success: true,
      commandCount: commands.length,
      responses,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute RCON commands',
    };
  }
}
