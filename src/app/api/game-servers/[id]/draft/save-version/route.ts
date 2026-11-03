/**
 * POST /api/game-servers/:id/draft/save-version  { revision, rulesetId | name, description? }
 *
 * Save as Ruleset version: the Draft's values become the next version of the
 * owner's Ruleset `rulesetId`, or version 1 of a new Ruleset called `name`,
 * with an optional description. The new version becomes the Draft's origin.
 * Nothing is applied.
 * - 201 { success, data: { ruleset: { id, name }, version: RulesetVersionSummary, draft: DraftView } },
 *   the Draft with its raised revision.
 * - 409 { success, error, data: DraftView } when the Draft has moved on from
 *   `revision`: nothing is saved, and `data` is the current Draft.
 * - 409 { success, error } when the owner already has a Ruleset called
 *   `name`, ignoring case.
 * - 400 without a revision and one of `rulesetId` or `name`, for a name or
 *   description the rules refuse.
 * - 404 for a game server or Ruleset that is not the owner's, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { draftView, findOwnedDraft, readRevision, staleDraft } from '@/lib/platform/drafts';
import { log } from '@/lib/platform/log';
import { readDescription, readId, readRulesetName, saveRulesetVersion, type VersionTarget } from '@/lib/platform/rulesets';

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
    const body = (typeof raw === 'object' && raw !== null ? raw : {}) as { revision?: unknown; rulesetId?: unknown; name?: unknown; description?: unknown };
    const revision = readRevision(body.revision);
    if (revision === undefined || (body.rulesetId === undefined) === (body.name === undefined)) {
      return failure(400, 'Send the revision the save is based on, and either the Ruleset to add a version to or the name of a new one');
    }
    let target: VersionTarget;
    if (body.rulesetId !== undefined) {
      const rulesetId = readId(body.rulesetId);
      if (rulesetId === undefined) return failure(404, 'No such Ruleset');
      target = { rulesetId };
    } else {
      const name = readRulesetName(body.name);
      if (!name.ok) return failure(400, name.error);
      target = name;
    }
    const description = readDescription(body.description);
    if (!description.ok) return failure(400, description.error);
    const saved = saveRulesetVersion(userId, gameServerId, revision, target, description.description);
    if (!saved) return failure(404, 'No such game server');
    if (!saved.ok) {
      if (saved.reason === 'stale') return NextResponse.json(staleDraft(saved.draft), { status: 409, headers: NO_STORE });
      if (saved.reason === 'name-taken') return failure(409, `You already have a Ruleset called ${saved.takenBy}`);
      return failure(404, 'No such Ruleset');
    }
    log.info('ruleset.version-saved', { userId, gameServerId, rulesetId: saved.ruleset.id, rulesetVersionId: saved.version.id });
    return NextResponse.json(
      { success: true, data: { ruleset: saved.ruleset, version: saved.version, draft: draftView(saved.draft) } },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    log.error('ruleset.version-save-failed', error, { userId });
    return failure(500, 'Could not save the Ruleset version');
  }
}
