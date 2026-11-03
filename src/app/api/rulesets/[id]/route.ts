/**
 * PATCH /api/rulesets/:id  { name }
 *   Renames one of the owner's Rulesets: 200 { success, data: { id, name } }.
 *   409 when another of their Rulesets has the name, ignoring case; 400 for a
 *   name that is empty, longer than 64 characters or has control characters.
 *
 * DELETE /api/rulesets/:id
 *   Deletes one of the owner's Rulesets with all its versions, after the
 *   page's confirm: { success }. Every Draft and Live configuration loaded
 *   from or saved as one of them keeps its values and loses its origin, in
 *   the same transaction. A single version is never deleted.
 *
 * 404 for an id that is not one of the owner's Rulesets, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { deleteRuleset, readId, readRulesetName, renameRuleset } from '@/lib/platform/rulesets';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const id = readId((await params).id);
    if (id === undefined) return failure(404, 'No such Ruleset');
    const body: unknown = await request.json().catch(() => undefined);
    const name = readRulesetName(typeof body === 'object' && body !== null ? (body as { name?: unknown }).name : undefined);
    if (!name.ok) return failure(400, name.error);
    const renamed = renameRuleset(userId, id, name);
    if (!renamed) return failure(404, 'No such Ruleset');
    if (!renamed.ok) return failure(409, `You already have a Ruleset called ${renamed.takenBy}`);
    log.info('ruleset.renamed', { userId, rulesetId: id });
    return NextResponse.json({ success: true, data: renamed.ruleset }, { headers: NO_STORE });
  } catch (error) {
    log.error('ruleset.rename-failed', error, { userId });
    return failure(500, 'Could not rename the Ruleset');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const id = readId((await params).id);
    const deleted = id === undefined ? undefined : deleteRuleset(userId, id);
    if (!deleted) return failure(404, 'No such Ruleset');
    log.info('ruleset.deleted', { userId, rulesetId: id, count: deleted.versions });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    log.error('ruleset.delete-failed', error, { userId });
    return failure(500, 'Could not delete the Ruleset');
  }
}
