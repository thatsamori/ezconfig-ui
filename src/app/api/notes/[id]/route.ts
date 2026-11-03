/**
 * PUT /api/notes/:id  { body }
 *   Edits the signed-in owner's own Note: the body is sanitized and
 *   overwrites the old one, and the edited time is set. { success, data:
 *   KeyNotes }, the key's Notes after the edit. 403 for anyone else's Note,
 *   the platform operator's included; 400 for a body with no text once
 *   sanitized; 413 for one over 64 KB.
 *
 * DELETE /api/notes/:id
 *   Deletes the signed-in owner's own Note, or any Note when they are the
 *   platform operator: { success, data: KeyNotes }. 403 for another owner's
 *   Note. The operator deleting a Note that is not theirs is logged, by the
 *   Note's id.
 *
 * 404 for an id that names no Note, or one on a key the schema lacks (kept,
 * not shown).
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { deleteNote, editNote, readNoteBody, type NoteChange } from '@/lib/platform/notes';
import { isPlatformOperator } from '@/lib/platform/users';

const NO_STORE = { 'Cache-Control': 'no-store' };
const BODY_LIMIT = 64 * 1024;
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

function answer(change: NoteChange, refused: string) {
  if (change.ok) return NextResponse.json({ success: true, data: change.notes }, { headers: NO_STORE });
  return change.reason === 'missing' ? failure(404, 'No such Note') : failure(403, refused);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const { user } = session;
  try {
    const { id } = await params;
    const text = await request.text();
    if (text.length > BODY_LIMIT) return failure(413, 'That Note is too long');
    let fields: { body?: unknown } | undefined;
    try { fields = JSON.parse(text); } catch { fields = undefined; }
    const body = readNoteBody(fields?.body);
    if (!body.ok) return failure(400, body.error);
    return answer(editNote({ userId: user.id, operator: isPlatformOperator(user.discordId) }, id, body.body), 'Only its author can edit a Note');
  } catch (error) {
    log.error('note.edit-failed', error, { userId: user.id });
    return failure(500, 'Could not save the Note');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const { user } = session;
  try {
    const { id } = await params;
    const deleted = deleteNote({ userId: user.id, operator: isPlatformOperator(user.discordId) }, id);
    if (deleted.ok && deleted.authorId !== user.id) log.info('note.deleted-by-operator', { userId: user.id, noteId: Number(id) });
    return answer(deleted, 'Only its author or the platform operator can delete a Note');
  } catch (error) {
    log.error('note.delete-failed', error, { userId: user.id });
    return failure(500, 'Could not delete the Note');
  }
}
