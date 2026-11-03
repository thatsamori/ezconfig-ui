/**
 * GET /api/game-servers/:id/draft
 *   The game server's Draft for the editor: { success, data: DraftView }, its
 *   values placed under their keys' current categories. `dropped` counts the
 *   stored values the schema has no place for: not shown, and kept.
 *
 * PUT /api/game-servers/:id/draft  { revision, document }
 *   Auto-save: the whole values document, with the revision it was based on.
 *   - 200 { success, data: { revision, savedAt, origin } }: saved, with the
 *     raised revision, and the origin (a Ruleset version, or null), which a
 *     save keeps but may now be modified from.
 *   - 400 { success, error, details: FieldError[] } when the schema refuses a
 *     value, or the body is not a document: nothing is saved.
 *   - 409 { success, error, data: DraftView } when the Draft has moved on from
 *     `revision`: nothing is saved, and `data` is the current Draft.
 *
 * 404 for an id that is not one of the owner's game servers, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { draftView, findOwnedDraft, readRevision, saveDraft, staleDraft } from '@/lib/platform/drafts';
import { log } from '@/lib/platform/log';
import { originOf } from '@/lib/platform/origins';
import { isValuesDocument } from '@/lib/config/valuesDocument';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** Far above a document of every key for every weapon. */
const BODY_LIMIT = 2 * 1024 * 1024;
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const draft = findOwnedDraft(session.user.id, (await params).id);
    if (!draft) return failure(404, 'No such game server');
    return NextResponse.json({ success: true, data: draftView(draft) }, { headers: NO_STORE });
  } catch (error) {
    log.error('draft.read-failed', error, { userId: session.user.id });
    return failure(500, 'Could not load the Draft');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const id = findOwnedDraft(userId, (await params).id)?.gameServerId;
    if (id === undefined) return failure(404, 'No such game server');
    const text = await request.text();
    if (text.length > BODY_LIMIT) return failure(413, 'The Draft is too large to save');
    let body: { revision?: unknown; document?: unknown } | undefined;
    try { body = JSON.parse(text); } catch { body = undefined; }
    const revision = readRevision(body?.revision);
    if (revision === undefined || !isValuesDocument(body?.document)) return failure(400, 'Send the whole Draft document with the revision it was based on');
    const saved = saveDraft(id, revision, body.document);
    if (!saved) return failure(404, 'No such game server');
    if (saved.ok) {
      const { revision: raised, savedAt, originId, document } = saved.draft;
      return NextResponse.json({ success: true, data: { revision: raised, savedAt, origin: originOf(originId, document) } }, { headers: NO_STORE });
    }
    if (saved.reason === 'invalid') return NextResponse.json({ success: false, error: 'Validation failed', details: saved.errors }, { status: 400, headers: NO_STORE });
    return NextResponse.json(staleDraft(saved.draft), { status: 409, headers: NO_STORE });
  } catch (error) {
    log.error('draft.save-failed', error, { userId });
    return failure(500, 'Could not save the Draft');
  }
}
