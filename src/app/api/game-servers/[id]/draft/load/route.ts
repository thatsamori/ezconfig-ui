/**
 * POST /api/game-servers/:id/draft/load  { revision, versionId }
 *
 * Loads one of the owner's Ruleset versions over the whole Draft, with the
 * revision it was based on checked, and makes it the Draft's origin. Each
 * value goes under its key's current category; nothing goes live until Apply.
 * - 200 { success, data: { draft: DraftView, dropped, errors: FieldError[] } }:
 *   `dropped` counts the version's values whose key or weapon class the
 *   schema lacks, which are left out; `errors` lists the loaded values the
 *   schema refuses, which block Apply until they are fixed.
 * - 409 { success, error, data: DraftView } when the Draft has moved on from
 *   `revision`: nothing is loaded, and `data` is the current Draft.
 * - 400 without a revision and a version id.
 * - 404 for a game server or Ruleset version that is not the owner's, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { draftView, findOwnedDraft, readRevision, staleDraft } from '@/lib/platform/drafts';
import { log } from '@/lib/platform/log';
import { loadRulesetVersion, readId } from '@/lib/platform/rulesets';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const gameServerId = findOwnedDraft(userId, (await params).id)?.gameServerId;
    if (gameServerId === undefined) return failure(404, 'No such game server');
    const raw: unknown = await request.json().catch(() => undefined);
    const body = (typeof raw === 'object' && raw !== null ? raw : {}) as { revision?: unknown; versionId?: unknown };
    const revision = readRevision(body.revision);
    if (revision === undefined || body.versionId === undefined) return failure(400, 'Send the revision the load is based on and the Ruleset version to load');
    const versionId = readId(body.versionId);
    const loaded = versionId === undefined ? { ok: false as const, reason: 'no-version' as const } : loadRulesetVersion(userId, gameServerId, revision, versionId);
    if (!loaded) return failure(404, 'No such game server');
    if (!loaded.ok) {
      if (loaded.reason === 'stale') return NextResponse.json(staleDraft(loaded.draft), { status: 409, headers: NO_STORE });
      return failure(404, 'No such Ruleset version');
    }
    log.info('ruleset.version-loaded', { userId, gameServerId, rulesetVersionId: versionId });
    return NextResponse.json({ success: true, data: { draft: draftView(loaded.draft), dropped: loaded.dropped, errors: loaded.errors } }, { headers: NO_STORE });
  } catch (error) {
    log.error('ruleset.version-load-failed', error, { userId });
    return failure(500, 'Could not load the Ruleset version');
  }
}
