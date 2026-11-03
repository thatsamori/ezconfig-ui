/**
 * POST /api/game-servers/:id/draft/discard  { revision }
 *
 * Discard changes: resets the Draft to the Live configuration's values, with
 * the revision it was based on checked. 200 { success, data: DraftView } with
 * the raised revision; 409 { success, error, data: DraftView } when the Draft
 * has moved on, and nothing is discarded; 409 { success, error } before the
 * first Apply, when there is no Live configuration to discard to; 400 without
 * a revision; 404 for an id that is not one of the owner's game servers.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { draftView, findOwnedDraft, readRevision } from '@/lib/platform/drafts';
import { discardChanges } from '@/lib/platform/live-configurations';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const id = findOwnedDraft(userId, (await params).id)?.gameServerId;
    if (id === undefined) return failure(404, 'No such game server');
    const body: unknown = await request.json().catch(() => undefined);
    const revision = readRevision(typeof body === 'object' && body !== null ? (body as { revision?: unknown }).revision : undefined);
    if (revision === undefined) return failure(400, 'Send the revision the discard is based on');
    const discarded = discardChanges(id, revision);
    if (!discarded) return failure(409, 'There is no Live configuration yet: nothing has been applied');
    if (!discarded.ok) return NextResponse.json({ success: false, error: 'The Draft changed since this page loaded it', data: discarded.reason === 'stale' ? draftView(discarded.draft) : undefined }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ success: true, data: draftView(discarded.draft) }, { headers: NO_STORE });
  } catch (error) {
    log.error('draft.discard-failed', error, { userId });
    return failure(500, 'Could not discard the changes');
  }
}
