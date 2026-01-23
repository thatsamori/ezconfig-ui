'use server';

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { characterConfigFlatMap } from '@/lib/config/characterConfigSchema';
import { weaponConfigFlatMap } from '@/lib/config/weaponConfigSchema';
import { DataType, ConfigEntry } from '@/lib/config/types';

export interface ParsedGameIni {
  characterValues: Record<string, any>;
  weaponValues: Record<string, Record<string, any>>;
}

// Parse Vector format: X=1.00,Y=2.00,Z=3.00 → {x: 1, y: 2, z: 3}
function parseVector(value: string): { x: number; y: number; z: number } | null {
  const match = value.match(/X=([-\d.]+),Y=([-\d.]+),Z=([-\d.]+)/i);
  if (!match) return null;
  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2]),
    z: parseFloat(match[3]),
  };
}

// Parse Vector2D format: X=1.00,Y=2.00 → {x: 1, y: 2}
function parseVector2D(value: string): { x: number; y: number } | null {
  const match = value.match(/X=([-\d.]+),Y=([-\d.]+)/i);
  if (!match) return null;
  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2]),
  };
}

// Parse FloatArray format: (1.00,2.00,3.00) → [1, 2, 3]
function parseFloatArray(value: string): number[] | null {
  // Handle format like (1.0,2.0,3.0) or (1.0, 2.0, 3.0)
  const match = value.match(/^\((.*)\)$/);
  if (!match) return null;

  const numbers = match[1].split(',').map(s => parseFloat(s.trim()));
  if (numbers.some(isNaN)) return null;
  return numbers;
}

// Convert string value based on expected data type
function convertValue(value: string, dataType: DataType): any {
  switch (dataType) {
    case DataType.Boolean:
      return value.toLowerCase() === 'true';
    case DataType.Float:
      return parseFloat(value);
    case DataType.Vector:
      return parseVector(value);
    case DataType.Vector2D:
      return parseVector2D(value);
    case DataType.FloatArray:
      return parseFloatArray(value);
    default:
      return value;
  }
}

// Parse section header: [EZCONFIG_Category_Group] or [EZCONFIG_WeaponName_GroupName]
function parseSectionHeader(line: string): { category: string; group: string } | null {
  const match = line.match(/^\[EZCONFIG_([^_]+)_([^\]]+)\]$/);
  if (!match) return null;
  return {
    category: match[1],
    group: match[2],
  };
}

// Check if this is a character config section (Movement, Combat, General)
function isCharacterSection(category: string): boolean {
  return ['Character'].includes(category);
}

export async function parseGameIni(filePath: string): Promise<ParsedGameIni> {
  const result: ParsedGameIni = {
    characterValues: {},
    weaponValues: {},
  };

  // Handle missing file gracefully
  if (!existsSync(filePath)) {
    console.warn(`Game.ini not found at ${filePath}, returning empty config`);
    return result;
  }

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    console.warn(`Failed to read Game.ini at ${filePath}:`, error);
    return result;
  }

  const lines = content.split('\n').map(line => line.trim());

  let currentSection: { category: string; group: string } | null = null;
  let isCharacter = false;
  let currentWeapon: string | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    // Check for EZCONFIG section header
    if (line.startsWith('[EZCONFIG_')) {
      currentSection = parseSectionHeader(line);
      if (currentSection) {
        isCharacter = isCharacterSection(currentSection.category);
        if (!isCharacter) {
          // For weapons, category is the weapon name
          currentWeapon = currentSection.category;
          if (!result.weaponValues[currentWeapon]) {
            result.weaponValues[currentWeapon] = {};
          }
        }
      }
      continue;
    }

    // Skip non-EZCONFIG sections
    if (line.startsWith('[')) {
      currentSection = null;
      isCharacter = false;
      currentWeapon = null;
      continue;
    }

    // Parse key=value pairs within EZCONFIG sections
    if (currentSection && line.includes('=')) {
      const eqIndex = line.indexOf('=');
      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();

      // Look up config entry to get data type
      const configEntry = isCharacter
        ? (characterConfigFlatMap as Record<string, ConfigEntry>)[key]
        : (weaponConfigFlatMap as Record<string, ConfigEntry>)[key];

      if (!configEntry) {
        // Unknown config key, skip
        continue;
      }

      const convertedValue = convertValue(value, configEntry.dataType);

      if (convertedValue === null) {
        console.warn(`Failed to parse value for ${key}: ${value}`);
        continue;
      }

      if (isCharacter) {
        result.characterValues[key] = convertedValue;
      } else if (currentWeapon) {
        result.weaponValues[currentWeapon][key] = convertedValue;
      }
    }
  }

  return result;
}
