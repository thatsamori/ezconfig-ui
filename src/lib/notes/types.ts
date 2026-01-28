/**
 * Notes layer types for JSON file storage
 */

/**
 * Note entry for a config option
 */
export type Note = {
  createdBy: string; // username who created the note
  note: string; // note content (plain text)
};

/**
 * Notes for a category file - keyed by config option name
 * Each option can have multiple notes from different users
 * Example: { "CanDodge": [{ createdBy: "admin", note: "Allows dodging" }] }
 */
export type NotesData = Record<string, Note[]>;
