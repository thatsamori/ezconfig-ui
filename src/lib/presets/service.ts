/**
 * Preset service layer for reading static presets
 *
 * Static presets are read-only configuration templates that users can apply
 * to quickly set up their game configuration.
 */

import { readFile, readdir, stat, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';
import { assertCameraPolicy } from '@/lib/config/cameraPolicyValidation';
import type { ConfigData } from '@/lib/database/types';
import type { PresetManifest, PresetInfo, PresetData, ConfigValue } from './types';

/**
 * Get the root path for presets
 */
export function getPresetsRoot(): string {
  return env.presetsPath;
}

/**
 * Get the path to static presets directory
 */
export function getStaticPresetsPath(): string {
  return join(getPresetsRoot(), 'Static');
}

/**
 * Get the path to user presets directory
 */
export function getUserPresetsPath(): string {
  return join(getPresetsRoot(), 'User');
}

/**
 * Validate that a preset name is safe (alphanumeric, hyphens, underscores only)
 * Throws an error if name is invalid
 */
export function validateUserPresetName(name: string): void {
  if (!name || name.length === 0) {
    throw new Error('Preset name is required');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Preset name can only contain letters, numbers, hyphens, and underscores');
  }

  // Also run path traversal check
  validatePresetName(name);
}

/**
 * Validate that a preset name does not contain path traversal attacks
 * Throws an error if name contains '..' or other traversal patterns
 */
export function validatePresetName(name: string): void {
  const dangerous = ['..', '\\..', '../', '..\\'];

  for (const pattern of dangerous) {
    if (name.includes(pattern)) {
      throw new Error(`Invalid preset name: path traversal detected in "${name}"`);
    }
  }

  // Also check for absolute paths that could escape
  if (name.startsWith('/') || name.startsWith('\\') || name.includes(':')) {
    throw new Error(`Invalid preset name: absolute paths not allowed in "${name}"`);
  }
}

/**
 * Read the manifest.json file for a preset
 */
export async function readPresetManifest(presetName: string): Promise<PresetManifest> {
  validatePresetName(presetName);

  const manifestPath = join(getStaticPresetsPath(), presetName, 'manifest.json');

  try {
    const content = await readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate manifest structure
    if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string') {
      throw new Error(`Invalid manifest format in preset "${presetName}"`);
    }

    return {
      title: parsed.title,
      description: parsed.description,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Preset "${presetName}" not found`);
    }
    throw error;
  }
}

/**
 * List all static presets with their manifests
 */
export async function listStaticPresets(): Promise<PresetInfo[]> {
  const staticPath = getStaticPresetsPath();

  try {
    const entries = await readdir(staticPath, { withFileTypes: true });
    const presets: PresetInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const manifest = await readPresetManifest(entry.name);
          presets.push({
            name: entry.name,
            manifest,
            ...await presetMetadata(join(staticPath, entry.name), await loadPresetData(entry.name)),
          });
        } catch (error) {
          // Skip presets with invalid or missing manifests
          console.warn(`Skipping preset "${entry.name}": ${(error as Error).message}`);
        }
      }
    }

    return presets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Static presets directory doesn't exist - return empty list
      return [];
    }
    throw error;
  }
}

/**
 * Recursively find all JSON files in a directory
 */
async function findJsonFiles(dirPath: string, relativePath: string = ''): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        const subFiles = await findJsonFiles(join(dirPath, entry.name), entryRelativePath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
        files.push(entryRelativePath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Parse a JSON config file containing ConfigData (object with key-value pairs)
 */
async function parseConfigFile(filePath: string): Promise<Record<string, ConfigValue>> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content) as ConfigData;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Invalid config file format: expected object`);
  }

  return data as Record<string, ConfigValue>;
}

/**
 * Load preset data in the same format as configStore.savedValues
 *
 * Structure expected:
 * - Character/{category}.json -> character[category]
 * - Weapon/{weaponName}/{category}.json -> weapons[weaponName][category]
 */
export async function loadPresetData(presetName: string): Promise<PresetData> {
  validatePresetName(presetName);

  const presetPath = join(getStaticPresetsPath(), presetName);

  // Verify preset exists
  try {
    await stat(presetPath);
  } catch {
    throw new Error(`Preset "${presetName}" not found`);
  }

  const data: PresetData = {
    character: {},
    weapons: {},
  };

  // Find all JSON files in the preset directory
  const jsonFiles = await findJsonFiles(presetPath);

  for (const relativePath of jsonFiles) {
    // Normalize path separators for cross-platform support
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');

    try {
      const fullPath = join(presetPath, relativePath);
      const values = await parseConfigFile(fullPath);

      if (parts[0] === 'Character' && parts.length === 2) {
        // Character/{category}.json
        const category = parts[1].replace('.json', '');
        data.character[category] = values;
      } else if (parts[0] === 'Weapon' && parts.length === 3) {
        // Weapon/{weaponName}/{category}.json
        const weaponName = parts[1];
        const category = parts[2].replace('.json', '');

        if (!data.weapons[weaponName]) {
          data.weapons[weaponName] = {};
        }
        data.weapons[weaponName][category] = values;
      }
      // Skip files that don't match expected structure
    } catch (error) {
      console.warn(`Error parsing ${relativePath}: ${(error as Error).message}`);
    }
  }

  assertCameraPolicy(data.character.Camera);
  return data;
}

/**
 * Read manifest from any preset path
 */
async function readManifestFromPath(presetPath: string): Promise<PresetManifest> {
  const manifestPath = join(presetPath, 'manifest.json');
  const content = await readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(content);

  if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string') {
    throw new Error('Invalid manifest format');
  }

  return {
    title: parsed.title,
    description: parsed.description,
  };
}

/**
 * List all user presets with their manifests
 */
export async function listUserPresets(): Promise<PresetInfo[]> {
  const userPath = getUserPresetsPath();

  try {
    const entries = await readdir(userPath, { withFileTypes: true });
    const presets: PresetInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const manifest = await readManifestFromPath(join(userPath, entry.name));
          presets.push({
            name: entry.name,
            manifest,
            ...await presetMetadata(join(userPath, entry.name), await loadUserPresetData(entry.name)),
          });
        } catch (error) {
          // Skip presets with invalid or missing manifests
          console.warn(`Skipping user preset "${entry.name}": ${(error as Error).message}`);
        }
      }
    }

    return presets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // User presets directory doesn't exist - return empty list
      return [];
    }
    throw error;
  }
}

/**
 * Save a user preset
 */
export async function saveUserPreset(
  name: string,
  manifest: PresetManifest,
  data: PresetData
): Promise<void> {
  validateUserPresetName(name);
  assertCameraPolicy(data.character.Camera);

  const presetPath = join(getUserPresetsPath(), name);

  // Create preset directory
  await mkdir(presetPath, { recursive: true });

  // Write manifest.json
  await writeFile(
    join(presetPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  // Write Character config files
  if (Object.keys(data.character).length > 0) {
    const characterPath = join(presetPath, 'Character');
    await mkdir(characterPath, { recursive: true });

    for (const [category, values] of Object.entries(data.character)) {
      // Write object directly (ConfigData format)
      await writeFile(
        join(characterPath, `${category}.json`),
        JSON.stringify(values, null, 2),
        'utf-8'
      );
    }
  }

  // Write Weapon config files
  if (Object.keys(data.weapons).length > 0) {
    for (const [weaponName, categories] of Object.entries(data.weapons)) {
      const weaponPath = join(presetPath, 'Weapon', weaponName);
      await mkdir(weaponPath, { recursive: true });

      for (const [category, values] of Object.entries(categories)) {
        // Write object directly (ConfigData format)
        await writeFile(
          join(weaponPath, `${category}.json`),
          JSON.stringify(values, null, 2),
          'utf-8'
        );
      }
    }
  }
}

/**
 * Delete a user preset
 */
export async function deleteUserPreset(name: string): Promise<void> {
  validateUserPresetName(name);

  const presetPath = join(getUserPresetsPath(), name);

  // Verify preset exists
  try {
    await stat(presetPath);
  } catch {
    throw new Error(`User preset "${name}" not found`);
  }

  // Recursively delete the preset directory
  await rm(presetPath, { recursive: true });
}

/**
 * Load user preset data
 */
export async function loadUserPresetData(presetName: string): Promise<PresetData> {
  validateUserPresetName(presetName);

  const presetPath = join(getUserPresetsPath(), presetName);

  // Verify preset exists
  try {
    await stat(presetPath);
  } catch {
    throw new Error(`User preset "${presetName}" not found`);
  }

  const data: PresetData = {
    character: {},
    weapons: {},
  };

  // Find all JSON files in the preset directory
  const jsonFiles = await findJsonFiles(presetPath);

  for (const relativePath of jsonFiles) {
    // Normalize path separators for cross-platform support
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');

    try {
      const fullPath = join(presetPath, relativePath);
      const values = await parseConfigFile(fullPath);

      if (parts[0] === 'Character' && parts.length === 2) {
        const category = parts[1].replace('.json', '');
        data.character[category] = values;
      } else if (parts[0] === 'Weapon' && parts.length === 3) {
        const weaponName = parts[1];
        const category = parts[2].replace('.json', '');

        if (!data.weapons[weaponName]) {
          data.weapons[weaponName] = {};
        }
        data.weapons[weaponName][category] = values;
      }
    } catch (error) {
      console.warn(`Error parsing ${relativePath}: ${(error as Error).message}`);
    }
  }

  assertCameraPolicy(data.character.Camera);
  return data;
}

// Test code - runs when executed directly with `bun run`
if (import.meta.main) {
  console.log('Running preset service tests...\n');

  console.log('Presets root:', getPresetsRoot());
  console.log('Static presets path:', getStaticPresetsPath());

  // Test 1: List static presets
  console.log('\nTest 1: Listing static presets...');
  try {
    const presets = await listStaticPresets();
    console.log(`  Found ${presets.length} preset(s)`);
    for (const preset of presets) {
      console.log(`  - ${preset.name}: ${preset.manifest.title}`);
    }
    console.log('  PASS\n');
  } catch (error) {
    console.log('  FAIL:', (error as Error).message);
  }

  // Test 2: Path traversal prevention
  console.log('Test 2: Testing path traversal prevention...');
  try {
    validatePresetName('../etc');
    console.log('  FAIL: Path traversal was not prevented');
  } catch (error) {
    if ((error as Error).message.includes('path traversal')) {
      console.log('  PASS: Path traversal correctly rejected\n');
    } else {
      console.log('  FAIL: Unexpected error:', (error as Error).message);
    }
  }

  console.log('Tests complete!');
}

async function presetMetadata(path: string, data: PresetData) {
  const count = (groups: Record<string, Record<string, ConfigValue>>) => Object.values(groups).reduce((sum, entries) => sum + Object.keys(entries).length, 0);
  const files = ['manifest.json', ...await findJsonFiles(path)];
  const mtimes = await Promise.all(files.map(async (file) => (await stat(join(path, file))).mtimeMs));
  return { weaponCount: Object.values(data.weapons).filter((groups) => count(groups) > 0).length, keyCount: count(data.character) + Object.values(data.weapons).reduce((sum, groups) => sum + count(groups), 0), updatedAt: new Date(Math.max(...mtimes)).toISOString() };
}
