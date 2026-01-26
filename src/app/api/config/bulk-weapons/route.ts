/**
 * Bulk Weapons API route handler
 *
 * POST /api/config/bulk-weapons - Apply a config entry to all weapons
 *
 * Request body:
 * {
 *   "category": "General" | "Strike" | "AltStrike" | "Stab" | "AltStab",
 *   "entry": { "ConfigKey": value }
 * }
 *
 * Response:
 * { "success": true, "data": { "weaponsUpdated": 15 } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readCategory, writeCategory } from '@/lib/database/service';
import { validateEntries } from '@/lib/database/validation';
import { scanDatabaseStructure, type GroupedDatabase } from '@/lib/database/structure';
import type { ConfigEntry } from '@/lib/database/types';

// Valid weapon categories
const VALID_CATEGORIES = ['General', 'Strike', 'AltStrike', 'Stab', 'AltStab'] as const;
type ValidCategory = (typeof VALID_CATEGORIES)[number];

function isValidCategory(category: string): category is ValidCategory {
  return VALID_CATEGORIES.includes(category as ValidCategory);
}

/**
 * POST /api/config/bulk-weapons
 *
 * Apply a config entry to all weapons for a given category.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: { category?: string; entry?: ConfigEntry };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate category
    if (!body.category || typeof body.category !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Request body must contain "category" string' },
        { status: 400 }
      );
    }

    if (!isValidCategory(body.category)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid category "${body.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const category = body.category;

    // Validate entry
    if (!body.entry || typeof body.entry !== 'object' || Array.isArray(body.entry)) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain "entry" object with single key-value pair' },
        { status: 400 }
      );
    }

    const entryKeys = Object.keys(body.entry);
    if (entryKeys.length !== 1) {
      return NextResponse.json(
        { success: false, error: 'Entry must have exactly one key-value pair' },
        { status: 400 }
      );
    }

    const entry = body.entry;

    // Validate entry against schema using any weapon name (schema is same for all weapons)
    const validation = validateEntries([entry], 'AnyWeapon', category);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Get all weapons from database structure
    const structure = await scanDatabaseStructure();
    const weaponGroup = structure['Weapon'];

    if (!weaponGroup || Array.isArray(weaponGroup)) {
      return NextResponse.json(
        { success: false, error: 'No weapons found in database' },
        { status: 404 }
      );
    }

    const weapons = weaponGroup as GroupedDatabase;
    const weaponNames = Object.keys(weapons);

    if (weaponNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No weapons found in database' },
        { status: 404 }
      );
    }

    // Apply entry to each weapon
    const entryKey = entryKeys[0];
    const entryValue = entry[entryKey];
    let weaponsUpdated = 0;

    for (const weaponName of weaponNames) {
      try {
        // Read existing entries
        const existingEntries = await readCategory(weaponName, category);

        // Merge or add the new entry
        let updated = false;
        const newEntries: ConfigEntry[] = existingEntries.map((existingEntry) => {
          const existingKey = Object.keys(existingEntry)[0];
          if (existingKey === entryKey) {
            updated = true;
            return { [entryKey]: entryValue };
          }
          return existingEntry;
        });

        // If key didn't exist, append it
        if (!updated) {
          newEntries.push({ [entryKey]: entryValue });
        }

        // Write back
        await writeCategory(weaponName, category, newEntries);
        weaponsUpdated++;
      } catch (error) {
        // Log error but continue with other weapons
        console.error(`Failed to update ${weaponName}/${category}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: { weaponsUpdated },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
