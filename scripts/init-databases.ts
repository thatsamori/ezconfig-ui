/**
 * Initialize Databases folder structure
 *
 * Creates empty JSON files for all weapons and character categories.
 * Idempotent - safe to run multiple times (won't overwrite existing files).
 *
 * Usage: bun run init-db
 */

import { mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { CategoryName } from '../src/lib/config/weaponConfigSchema';
import { CharacterConfigGroupName } from '../src/lib/config/characterConfigSchema';

const DATABASES_PATH = './Databases';

// All weapon names from CategoryName enum
const WEAPONS = Object.values(CategoryName);

// Weapon categories (General + all attack types)
const WEAPON_CATEGORIES = ['General', 'Strike', 'AltStrike', 'Stab', 'AltStab'];

// Character categories from CharacterConfigGroupName enum
const CHARACTER_CATEGORIES = Object.values(CharacterConfigGroupName);

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a JSON file with empty array if it doesn't exist
 */
async function createIfNotExists(filePath: string): Promise<boolean> {
  if (await fileExists(filePath)) {
    return false; // Already exists
  }

  await writeFile(filePath, '[]', 'utf-8');
  return true; // Created
}

async function main() {
  console.log('Initializing Databases folder structure...\n');

  let created = 0;
  let skipped = 0;

  // Create Character categories
  console.log('Creating Character categories...');
  const characterPath = join(DATABASES_PATH, 'Character');
  await mkdir(characterPath, { recursive: true });

  for (const category of CHARACTER_CATEGORIES) {
    const filePath = join(characterPath, `${category}.json`);
    if (await createIfNotExists(filePath)) {
      console.log(`  Created: ${filePath}`);
      created++;
    } else {
      skipped++;
    }
  }

  // Create Weapon categories for each weapon
  console.log('\nCreating Weapon categories...');

  for (const weapon of WEAPONS) {
    const weaponPath = join(DATABASES_PATH, 'Weapon', weapon);
    await mkdir(weaponPath, { recursive: true });

    for (const category of WEAPON_CATEGORIES) {
      const filePath = join(weaponPath, `${category}.json`);
      if (await createIfNotExists(filePath)) {
        console.log(`  Created: ${filePath}`);
        created++;
      } else {
        skipped++;
      }
    }
  }

  console.log('\n---');
  console.log(`Created: ${created} files`);
  console.log(`Skipped: ${skipped} files (already exist)`);
  console.log('Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
