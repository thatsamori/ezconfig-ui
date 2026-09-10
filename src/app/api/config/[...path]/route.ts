/**
 * Config API route handler
 *
 * GET /api/config/{database}/{category} - Read config entries
 * POST /api/config/{database}/{category} - Write config entries
 *
 * The last path segment is the category, everything before is the database path.
 * Examples:
 *   /api/config/Character/Movement -> database="Character", category="Movement"
 *   /api/config/Greatsword/Strike -> database="Greatsword", category="Strike"
 */

import { NextRequest, NextResponse } from 'next/server';
import { readCategory, writeCategory, patchCategory } from '@/lib/database/service';
import { getSchemaForCategory, validateEntries } from '@/lib/database/validation';
import type { ConfigData } from '@/lib/database/types';

/**
 * Parse path segments into database and category
 * Last segment is always the category, rest is the database path
 */
function parsePath(pathSegments: string[]): { database: string; category: string } | null {
  if (!pathSegments || pathSegments.length < 2) {
    return null;
  }

  // Last segment is the category
  const category = pathSegments[pathSegments.length - 1];
  // Everything else is the database path (join with / for nested paths)
  const database = pathSegments.slice(0, -1).join('/');

  return { database, category };
}

/**
 * GET /api/config/{database}/{category}
 *
 * Read config entries from a category file.
 * Returns empty array if file doesn't exist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const parsed = parsePath(pathSegments);

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid path: expected /api/config/{database}/{category}' },
        { status: 400 }
      );
    }

    const { database, category } = parsed;
    const entries = await readCategory(database, category);

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/config/{database}/{category}
 *
 * Write config data to a category file.
 * Validates data against schema before writing.
 *
 * Request body: { entries: ConfigData } (object with key-value pairs)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const parsed = parsePath(pathSegments);

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid path: expected /api/config/{database}/{category}' },
        { status: 400 }
      );
    }

    const { database, category } = parsed;

    // Parse request body
    let body: { entries?: ConfigData };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    if (!body.entries || typeof body.entries !== 'object' || Array.isArray(body.entries)) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain "entries" object' },
        { status: 400 }
      );
    }

    // Validate entries against schema
    const isPatch = request.method === 'PATCH';
    const checked = isPatch ? Object.fromEntries(Object.entries(body.entries).filter(([, value]) => value !== null)) : body.entries;
    const schema = getSchemaForCategory(database, category) ?? {};
    if (isPatch && Object.keys(body.entries).some(key => !Object.hasOwn(schema, key))) {
      return NextResponse.json({ success: false, error: 'Unknown config key' }, { status: 400 });
    }
    const validation = validateEntries(checked, database, category);
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

    // Write to file
    await (isPatch ? patchCategory : writeCategory)(database, category, body.entries);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const PATCH = POST;
