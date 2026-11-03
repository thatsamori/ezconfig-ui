/**
 * GET /api/notes
 *   Every Note on a key the schema has, from every server owner:
 *   { success, data: { Character: { <key>: NoteView[] }, Weapon: { <key>: NoteView[] } } },
 *   oldest first within a key. Each Note says whether the signed-in owner may
 *   edit it (their own) or delete it (their own, or any for the platform
 *   operator). A Note with no author is by "a former server owner".
 *
 * POST /api/notes  { database, key, body }
 *   Adds the signed-in owner's Note to a config key, `database` being
 *   Character or Weapon: 201 { success, data: KeyNotes }, the key's Notes
 *   after the add. The author always comes from the session; any author the
 *   body names is ignored. The body is sanitized before it is stored.
 *   - 400 for a database or key the schema lacks, or a body with no text once
 *     sanitized;
 *   - 413 for a body over 64 KB.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { addNote, isNoteDatabase, isNoteKey, listNotes, readNoteBody } from '@/lib/platform/notes';
import { isPlatformOperator } from '@/lib/platform/users';

const NO_STORE = { 'Cache-Control': 'no-store' };
const BODY_LIMIT = 64 * 1024;
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const { user } = session;
  try {
    return NextResponse.json({ success: true, data: listNotes({ userId: user.id, operator: isPlatformOperator(user.discordId) }) }, { headers: NO_STORE });
  } catch (error) {
    log.error('note.list-failed', error, { userId: user.id });
    return failure(500, 'Could not load the Notes');
  }
}

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const { user } = session;
  try {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return failure(413, 'That Note is too long');
    let fields: { database?: unknown; key?: unknown; body?: unknown } | undefined;
    try { fields = JSON.parse(text); } catch { fields = undefined; }
    const { database, key } = fields ?? {};
    if (!isNoteDatabase(database) || typeof key !== 'string' || !isNoteKey(database, key)) return failure(400, 'Notes go on a Character or Weapon config key');
    const body = readNoteBody(fields?.body);
    if (!body.ok) return failure(400, body.error);
    const notes = addNote({ userId: user.id, operator: isPlatformOperator(user.discordId) }, database, key, body.body);
    return NextResponse.json({ success: true, data: notes }, { status: 201, headers: NO_STORE });
  } catch (error) {
    log.error('note.add-failed', error, { userId: user.id });
    return failure(500, 'Could not save the Note');
  }
}
