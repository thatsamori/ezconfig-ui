import { NextRequest, NextResponse } from 'next/server';
import { readCategory, writeCategory } from '@/lib/database/service';
import { validateEntries } from '@/lib/database/validation';
import { CategoryName, WeaponConfigGroupName } from '@/lib/config/weaponConfigSchema';
import type { ConfigData } from '@/lib/database/types';

/** Accept either the legacy shared entry or entries specific to each weapon. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Object.values(WeaponConfigGroupName).includes(body.category)) return NextResponse.json({
      success: false,
      error: 'Invalid weapon category'
    }, {
      status: 400
    });
    const names = Object.values(CategoryName);
    const weaponValues: Record<string, ConfigData> = body.weaponValues ?? Object.fromEntries(names.map(name => [name, body.entry]));
    if (!weaponValues || typeof weaponValues !== 'object' || Array.isArray(weaponValues) || !Object.keys(weaponValues).length) return NextResponse.json({
      success: false,
      error: 'Provide weaponValues or an entry'
    }, {
      status: 400
    });
    // Validate the complete batch before making any changes.
    for (const [weapon, entries] of Object.entries(weaponValues)) {
      if (!names.includes(weapon as CategoryName) || !entries || typeof entries !== 'object' || Array.isArray(entries) || Object.keys(entries).length !== 1) return NextResponse.json({
        success: false,
        error: 'Each known weapon must have exactly one entry'
      }, {
        status: 400
      });
      const result = validateEntries(entries, weapon, body.category);
      if (!result.valid) return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: result.errors
      }, {
        status: 400
      });
    }
    const updatedWeapons: string[] = [];
    const failedWeapons: string[] = [];
    for (const [weapon, entries] of Object.entries(weaponValues)) {
      try {
        await writeCategory(weapon, body.category, {
          ...(await readCategory(weapon, body.category)),
          ...entries
        });
        updatedWeapons.push(weapon);
      } catch {
        failedWeapons.push(weapon);
      }
    }
    return NextResponse.json({
      success: !failedWeapons.length,
      data: {
        weaponsUpdated: updatedWeapons.length,
        updatedWeapons,
        failedWeapons
      },
      ...(failedWeapons.length ? {
        error: `Failed to save ${failedWeapons.join(', ')}. Other changes were saved.`
      } : {})
    }, {
      status: failedWeapons.length ? 500 : 200
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof SyntaxError ? 'Invalid JSON' : 'Could not save bulk changes'
    }, {
      status: error instanceof SyntaxError ? 400 : 500
    });
  }
}
