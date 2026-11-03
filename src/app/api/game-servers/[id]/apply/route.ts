/**
 * GET /api/game-servers/:id/apply
 *   The review of an Apply now: { success, data: ApplyReview }, the keys the
 *   Draft adds, changes and resets to game default against the Live
 *   configuration (before the first Apply, every value it sets), the values
 *   the current schema refuses, and the Draft revision and Live configuration
 *   id (null: none) it was built from.
 *
 * POST /api/game-servers/:id/apply  { revision, liveConfigurationId }
 *   Apply: the whole Draft becomes the Live configuration, under a new id, and
 *   the game server's held poll is woken with it.
 *   - 200 { success, data: { liveConfigurationId, appliedAt } }.
 *   - 409 { success, error, reason } when the game server is not Connected or
 *     not on the Supported build: `reason` is never-connected, not-connected
 *     or needs-updating, checked when the request arrives.
 *   - 409 { success, error, reason: 'stale', data: ApplyReview } when the Draft
 *     or the Live configuration moved on from the review: `data` is the review
 *     as it is now, to reopen.
 *   - 400 { success, error, details: FieldError[] } when the schema refuses a
 *     value in the Draft; 400 without a revision and Live configuration id.
 *   Nothing changes on any refusal.
 *
 * 404 for an id that is not one of the owner's game servers, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { readRevision } from '@/lib/platform/drafts';
import { findOwnedGameServer, gameServerView, type ApplyBlocked } from '@/lib/platform/game-servers';
import { applyDraft, applyReview } from '@/lib/platform/live-configurations';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });
const ownedServer = (ownerId: number, id: string) => /^[1-9]\d{0,15}$/.test(id) ? findOwnedGameServer(ownerId, Number(id)) : undefined;

const BLOCKED: Record<ApplyBlocked, string> = {
  'never-connected': 'Never connected: Apply needs the game server Connected',
  'not-connected': 'Not connected: Apply needs the game server Connected',
  'needs-updating': 'EZConfig needs updating: the platform sends configuration only to the Supported build',
};

/** A Live configuration id as a request sends it: null for none. */
const readLiveConfigurationId = (value: unknown): string | null | undefined =>
  value === null || (typeof value === 'string' && value.length > 0 && value.length <= 64) ? value : undefined;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const server = ownedServer(session.user.id, (await params).id);
    const review = server && applyReview(server.id);
    if (!review) return failure(404, 'No such game server');
    return NextResponse.json({ success: true, data: review }, { headers: NO_STORE });
  } catch (error) {
    log.error('apply.review-failed', error, { userId: session.user.id });
    return failure(500, 'Could not build the review');
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const { id } = await params;
    if (!ownedServer(userId, id)) return failure(404, 'No such game server');
    const body: unknown = await request.json().catch(() => undefined);
    const fields = typeof body === 'object' && body !== null ? body as { revision?: unknown; liveConfigurationId?: unknown } : {};
    const revision = readRevision(fields.revision), liveConfigurationId = readLiveConfigurationId(fields.liveConfigurationId);
    if (revision === undefined || liveConfigurationId === undefined) return failure(400, 'Send the Draft revision and the Live configuration id the review was built from');
    // Read again after the body arrived: from here on nothing awaits, so nothing moves between the checks and the Apply.
    const server = ownedServer(userId, id);
    if (!server) return failure(404, 'No such game server');
    const blocked = gameServerView(server).applyBlocked;
    if (blocked) return NextResponse.json({ success: false, error: BLOCKED[blocked], reason: blocked }, { status: 409, headers: NO_STORE });
    const applied = applyDraft(server.id, { revision, liveConfigurationId });
    if (!applied) return failure(404, 'No such game server');
    if (applied.ok) {
      const { id: appliedId, appliedAt } = applied.liveConfiguration;
      log.info('live-configuration.applied', { userId, gameServerId: server.id, liveConfigurationId: appliedId });
      return NextResponse.json({ success: true, data: { liveConfigurationId: appliedId, appliedAt } }, { headers: NO_STORE });
    }
    if (applied.reason === 'invalid') return NextResponse.json({ success: false, error: 'Validation failed', details: applied.errors }, { status: 400, headers: NO_STORE });
    return NextResponse.json(
      { success: false, error: 'The Draft or the Live configuration changed since this review was built', reason: 'stale', data: applied.review },
      { status: 409, headers: NO_STORE },
    );
  } catch (error) {
    log.error('apply.failed', error, { userId });
    return failure(500, 'Could not Apply the Draft');
  }
}
