/**
 * Notes layer types for JSON file storage
 */

/**
 * Note entry for a config option
 */
export type Note = {
  id: string; // unique identifier for the note
  createdBy: string; // username who created the note
  note: string; // note content (plain text or HTML)
};

/**
 * Generate a unique ID for a note
 * Uses timestamp + random string for uniqueness
 */
export function generateNoteId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Notes for a schema file - keyed by config option name
 * Each option can have multiple notes from different users
 * Notes are shared across all categories where a config key appears.
 * Example: { "CanDodge": [{ createdBy: "admin", note: "Allows dodging" }] }
 */
export type NotesData = Record<string, Note[]>;

/**
 * Get schema name from database path
 * - "Character" → "character"
 * - Everything else (weapon names like "ArmingSword") → "weapon"
 *
 * This function is safe to import in client components.
 */
export function getSchemaFromDatabase(database: string): string {
  const firstPart = database.split('/')[0].toLowerCase();
  if (firstPart === 'character') return 'character';
  // All non-character databases are weapons (e.g., "ArmingSword", "Greatsword")
  return 'weapon';
}
