/**
 * Preset Import API
 *
 * POST /api/presets/import - Import a preset from a ZIP file
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { getUserPresetsPath, validateUserPresetName, listUserPresets } from '@/lib/presets';
import type { PresetManifest } from '@/lib/presets/types';

/**
 * Convert a title to a safe preset folder name
 * - Lowercase
 * - Replace spaces and special characters with hyphens
 * - Remove consecutive hyphens
 * - Remove leading/trailing hyphens
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique preset name, appending a number if necessary
 */
async function generateUniqueName(baseName: string): Promise<string> {
  const existingPresets = await listUserPresets();
  const existingNames = new Set(existingPresets.map((p) => p.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  // Find the next available number
  let counter = 2;
  while (existingNames.has(`${baseName}-${counter}`)) {
    counter++;
  }

  return `${baseName}-${counter}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Get custom metadata from form data (optional - falls back to manifest values)
    const customName = formData.get('name') as string | null;
    const customTitle = formData.get('title') as string | null;
    const customDescription = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      return NextResponse.json(
        { success: false, error: 'File must be a ZIP archive' },
        { status: 400 }
      );
    }

    // Read the ZIP file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid ZIP file format' },
        { status: 400 }
      );
    }

    // Validate manifest.json exists
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return NextResponse.json(
        { success: false, error: 'Invalid preset: missing manifest.json' },
        { status: 400 }
      );
    }

    // Parse and validate manifest (used as fallback if no custom values provided)
    let manifest: PresetManifest;
    try {
      const manifestContent = await manifestFile.async('string');
      manifest = JSON.parse(manifestContent);

      if (!manifest.title || typeof manifest.title !== 'string') {
        throw new Error('Invalid title');
      }

      // Ensure description is a string
      manifest.description = manifest.description || '';
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid manifest.json format' },
        { status: 400 }
      );
    }

    // Use custom values or fall back to manifest values
    const finalTitle = customTitle || manifest.title;
    const finalDescription = customDescription !== null ? customDescription : manifest.description;

    // Determine preset name: use custom name if provided, otherwise generate from title
    let presetName: string;
    if (customName) {
      // Validate the custom name
      try {
        validateUserPresetName(customName);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid preset name - only alphanumeric, hyphens, and underscores allowed' },
          { status: 400 }
        );
      }

      // Check if name already exists
      const existingPresets = await listUserPresets();
      const existingNames = new Set(existingPresets.map((p) => p.name));
      if (existingNames.has(customName)) {
        return NextResponse.json(
          { success: false, error: 'A preset with this name already exists' },
          { status: 400 }
        );
      }

      presetName = customName;
    } else {
      // Generate name from title (legacy behavior)
      const baseName = slugify(manifest.title);
      if (!baseName) {
        return NextResponse.json(
          { success: false, error: 'Invalid preset title - cannot generate folder name' },
          { status: 400 }
        );
      }

      // Validate the name pattern
      try {
        validateUserPresetName(baseName);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid preset title - contains invalid characters' },
          { status: 400 }
        );
      }

      // Generate unique name if needed
      presetName = await generateUniqueName(baseName);
    }

    const presetPath = join(getUserPresetsPath(), presetName);

    // Ensure user presets directory exists
    const userPresetsPath = getUserPresetsPath();
    try {
      await stat(userPresetsPath);
    } catch {
      await mkdir(userPresetsPath, { recursive: true });
    }

    // Create preset directory
    await mkdir(presetPath, { recursive: true });

    // Extract all files from ZIP, except manifest.json (we'll write our own)
    const files = Object.entries(zip.files);

    for (const [relativePath, zipEntry] of files) {
      // Skip directories - they'll be created when writing files
      if (zipEntry.dir) {
        continue;
      }

      // Skip manifest.json - we'll write our own with custom values
      if (relativePath === 'manifest.json') {
        continue;
      }

      // Sanitize path to prevent directory traversal
      const normalizedPath = relativePath.replace(/\\/g, '/');
      if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
        console.warn(`Skipping potentially malicious path: ${relativePath}`);
        continue;
      }

      const fullPath = join(presetPath, normalizedPath);

      // Ensure parent directory exists
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf('\\') > 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
      if (parentDir !== presetPath) {
        await mkdir(parentDir, { recursive: true });
      }

      // Write file
      const content = await zipEntry.async('nodebuffer');
      await writeFile(fullPath, content);
    }

    // Write manifest.json with custom title/description
    const finalManifest: PresetManifest = {
      title: finalTitle,
      description: finalDescription,
    };
    await writeFile(
      join(presetPath, 'manifest.json'),
      JSON.stringify(finalManifest, null, 2)
    );

    return NextResponse.json({
      success: true,
      data: {
        name: presetName,
        title: finalTitle,
        description: finalDescription,
      },
    });
  } catch (error) {
    console.error('Error importing preset:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing preset',
      },
      { status: 500 }
    );
  }
}
