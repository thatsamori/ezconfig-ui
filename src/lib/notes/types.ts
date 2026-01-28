/**
 * Notes layer types for JSON file storage
 */

/**
 * Note entry for a config option
 */
export type Note = {
  createdBy: string; // username who created the note
  note: string; // note content (plain text or HTML)
};

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
