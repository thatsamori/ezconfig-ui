/**
 * GET /api/rulesets
 *
 * The signed-in owner's Rulesets by name, each with its versions newest
 * first: { success, data: RulesetSummary[] }. Never their values, and never
 * another owner's. Rulesets are made by Save as Ruleset version
 * (/api/game-servers/:id/draft/save-version) and by importing a Ruleset file
 * (/api/rulesets/import).
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { listRulesets } from '@/lib/platform/rulesets';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    return NextResponse.json({ success: true, data: listRulesets(session.user.id) }, { headers: NO_STORE });
  } catch (error) {
    log.error('ruleset.list-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not load your Rulesets' }, { status: 500, headers: NO_STORE });
  }
}
