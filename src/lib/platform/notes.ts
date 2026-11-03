/**
 * Notes (online-platform#36): comments on config keys that every server owner
 * reads, kept by database (Character or Weapon) and key name. Never part of a
 * Draft, Live configuration or Ruleset version.
 *
 * - The author is the signed-in server owner; a route never takes one from
 *   the request.
 * - An author edits and deletes their own Notes. The platform operator
 *   deletes any Note and edits only their own, as an author.
 * - Every body goes through `sanitizeNoteBody` before it is stored: an
 *   allowlist of what the Notes editor makes (paragraphs and line breaks,
 *   bold, italic, underline, lists, inline code and http(s) links). Anything
 *   else is stripped, keeping its text unless it is script or style. The
 *   Content-Security-Policy (src/proxy.ts) is the backstop.
 * - A Note on a key the schema no longer has is kept and not shown, nor
 *   edited or deleted, until the key returns.
 * - A deleted server owner's Notes stay, by "a former server owner".
 *
 * Never log a body: a log line names a Note by its id.
 */
import sanitizeHtml from 'sanitize-html';
import { CHARACTER_CONFIG_OPTIONS } from '@/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS } from '@/lib/config/weaponConfigSchema';
import { platformStore } from './storage';

export type NoteDatabase = 'Character' | 'Weapon';
export const NOTE_DATABASES: readonly NoteDatabase[] = ['Character', 'Weapon'];
export const FORMER_SERVER_OWNER = 'a former server owner';

/** Who is reading: what each Note offers them depends on it. */
export interface NoteViewer {
  userId: number;
  operator: boolean;
}

/** A Note as a server owner sees it. */
export interface NoteView {
  id: number;
  /** The author's name, or "a former server owner". */
  author: string;
  /** Sanitized HTML. */
  body: string;
  createdAt: number;
  editedAt: number | null;
  /** Only the author edits. */
  canEdit: boolean;
  /** The author, or the platform operator. */
  canDelete: boolean;
}

/** Every Note shown: database → key name → its Notes, oldest first. */
export type NotesByKey = Record<NoteDatabase, Record<string, NoteView[]>>;

/** One key's Notes after a change, for the panel to replace its list with. */
export interface KeyNotes {
  database: NoteDatabase;
  key: string;
  notes: NoteView[];
}

export type NoteChange =
  | { ok: true; notes: KeyNotes; authorId: number | null }
  | { ok: false; reason: 'missing' | 'not-allowed' };

const allKeys = <Entry extends { configKey: string }>(groups: Record<string, Entry[]>) => new Set(Object.values(groups).flat().map(entry => entry.configKey));
const SCHEMA_KEYS: Record<NoteDatabase, ReadonlySet<string>> = { Character: allKeys(CHARACTER_CONFIG_OPTIONS), Weapon: allKeys(WEAPON_CONFIG_OPTIONS) };

export const isNoteDatabase = (value: unknown): value is NoteDatabase => value === 'Character' || value === 'Weapon';

/** Whether the current schema has the key: only these Notes are shown, added, edited or deleted. */
export const isNoteKey = (database: NoteDatabase, key: string) => SCHEMA_KEYS[database].has(key);

// The Notes editor's marks and nodes (src/components/notes/RichTextEditor.tsx), and nothing else.
const SANITIZER: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'code', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // A stripped element keeps its text, escaped; script, style, textarea and option lose it too.
  disallowedTagsMode: 'discard',
  transformTags: {
    b: 'strong',
    i: 'em',
    // A link keeps only an absolute http(s) address, as the browser will read it. Any other
    // address is dropped here, and the filter below then drops the link and keeps its text.
    // (Renaming the tag instead would leak the new name onto a later sibling's closing tag.)
    a: (tagName, attribs): sanitizeHtml.Tag => {
      let url: URL | undefined;
      try { url = new URL(attribs.href ?? ''); } catch { url = undefined; }
      if (url?.protocol !== 'http:' && url?.protocol !== 'https:') return { tagName, attribs: {} };
      return { tagName, attribs: { href: url.href, target: '_blank', rel: 'noopener noreferrer nofollow' } };
    },
  },
  exclusiveFilter: frame => frame.tag === 'a' && !frame.attribs.href ? 'excludeTag' : false,
};

/** A body as stored: the allowlist applied. Also the import's (#40). */
export const sanitizeNoteBody = (html: string): string => sanitizeHtml(html, SANITIZER);

/** Whether a sanitized body shows any text. */
export const hasNoteText = (body: string): boolean => sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).trim().length > 0;

/** A body as a request sends it, sanitized; refused when nothing with text is left. */
export function readNoteBody(value: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof value === 'string' ? sanitizeNoteBody(value) : '';
  return hasNoteText(body) ? { ok: true, body } : { ok: false, error: 'A Note needs some text' };
}

type Row = { id: number; database_name: NoteDatabase; key_name: string; author_id: number | null; author: string | null; body: string; created_at: number; edited_at: number | null };
const SELECT = `SELECT notes.id, notes.database_name, notes.key_name, notes.author_id, users.username AS author, notes.body, notes.created_at, notes.edited_at
  FROM notes LEFT JOIN users ON users.id = notes.author_id`;
const ORDER = 'ORDER BY notes.database_name, notes.key_name, notes.created_at, notes.id';

function view(row: Row, viewer: NoteViewer): NoteView {
  const own = row.author_id === viewer.userId;
  return {
    id: row.id, author: row.author ?? FORMER_SERVER_OWNER, body: row.body, createdAt: row.created_at, editedAt: row.edited_at,
    canEdit: own, canDelete: own || viewer.operator,
  };
}

/** Every Note on a key the schema has, by database and key. */
export function listNotes(viewer: NoteViewer): NotesByKey {
  const notes: NotesByKey = { Character: {}, Weapon: {} };
  for (const row of platformStore().all<Row>(`${SELECT} ${ORDER}`)) {
    if (isNoteKey(row.database_name, row.key_name)) (notes[row.database_name][row.key_name] ??= []).push(view(row, viewer));
  }
  return notes;
}

function keyNotes(viewer: NoteViewer, database: NoteDatabase, key: string): KeyNotes {
  const rows = platformStore().all<Row>(`${SELECT} WHERE notes.database_name = ? AND notes.key_name = ? ${ORDER}`, database, key);
  return { database, key, notes: rows.map(row => view(row, viewer)) };
}

/** Adds the viewer's Note to a key the schema has; `body` is already sanitized. */
export function addNote(viewer: NoteViewer, database: NoteDatabase, key: string, body: string, now = Date.now()): KeyNotes {
  platformStore().run('INSERT INTO notes (database_name, key_name, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', database, key, viewer.userId, body, now);
  return keyNotes(viewer, database, key);
}

/** A Note the viewer could see, by the id a route was given. */
function findShownNote(id: string): Row | undefined {
  const row = /^[1-9]\d{0,15}$/.test(id) ? platformStore().get<Row>(`${SELECT} WHERE notes.id = ?`, Number(id)) : undefined;
  return row && isNoteKey(row.database_name, row.key_name) ? row : undefined;
}

/** Overwrites the body of the viewer's own Note and sets its edited time; `body` is already sanitized. */
export function editNote(viewer: NoteViewer, id: string, body: string, now = Date.now()): NoteChange {
  const store = platformStore();
  return store.transaction((): NoteChange => {
    const note = findShownNote(id);
    if (!note) return { ok: false, reason: 'missing' };
    if (note.author_id !== viewer.userId) return { ok: false, reason: 'not-allowed' };
    store.run('UPDATE notes SET body = ?, edited_at = ? WHERE id = ?', body, now, note.id);
    return { ok: true, notes: keyNotes(viewer, note.database_name, note.key_name), authorId: note.author_id };
  });
}

/** Deletes the viewer's own Note, or any Note when the viewer is the platform operator. */
export function deleteNote(viewer: NoteViewer, id: string): NoteChange {
  const store = platformStore();
  return store.transaction((): NoteChange => {
    const note = findShownNote(id);
    if (!note) return { ok: false, reason: 'missing' };
    if (note.author_id !== viewer.userId && !viewer.operator) return { ok: false, reason: 'not-allowed' };
    store.run('DELETE FROM notes WHERE id = ?', note.id);
    return { ok: true, notes: keyNotes(viewer, note.database_name, note.key_name), authorId: note.author_id };
  });
}
