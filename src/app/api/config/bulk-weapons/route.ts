import { NextRequest, NextResponse } from 'next/server';
import { readCategory, writeCategory } from '@/lib/database/service';
import { getSchemaForCategory, validateEntries } from '@/lib/database/validation';
import { CategoryName, WeaponConfigGroupName } from '@/lib/config/weaponConfigSchema';
import type { ConfigData } from '@/lib/database/types';

/** Accept shared or per-weapon entries; null removes an override. */
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
    const weaponValues: Record<string, Record<string, ConfigData[string] | null>> = body.weaponValues ?? Object.fromEntries(names.map(name => [name, body.entry]));
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
      const [key, value] = Object.entries(entries)[0];
      const result = value === null
        ? { valid: Object.hasOwn(getSchemaForCategory(weapon, body.category) ?? {}, key), errors: [`Unknown config key: ${key}`] }
        : validateEntries(entries as ConfigData, weapon, body.category);
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
        const saved = { ...(await readCategory(weapon, body.category)) };
        for (const [key, value] of Object.entries(entries)) {
          if (value === null) delete saved[key];
          else saved[key] = value;
        }
        await writeCategory(weapon, body.category, saved);
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
