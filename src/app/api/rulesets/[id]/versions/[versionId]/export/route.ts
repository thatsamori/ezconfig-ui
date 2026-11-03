/**
 * GET /api/rulesets/:id/versions/:versionId/export
 *
 * One of the owner's Ruleset versions as a Ruleset file to download: its name,
 * the version's description and its values, and nothing else
 * (src/lib/config/rulesetFile.ts).
 *
 * 404 for a Ruleset or version that is not the owner's, whoever's it is, or a
 * version of another Ruleset.
 */
import { NextResponse } from 'next/server';
import { rulesetFileDisposition } from '@/lib/config/rulesetFile';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { exportRulesetVersion, readId } from '@/lib/platform/rulesets';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const route = await params;
    const rulesetId = readId(route.id), rulesetVersionId = readId(route.versionId);
    const exported = rulesetId === undefined || rulesetVersionId === undefined ? undefined : exportRulesetVersion(userId, rulesetId, rulesetVersionId);
    if (!exported) return failure(404, 'No such Ruleset version');
    log.info('ruleset.version-exported', { userId, rulesetId, rulesetVersionId });
    return new Response(exported.text, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': rulesetFileDisposition(exported.name, exported.number),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    log.error('ruleset.version-export-failed', error, { userId });
    return failure(500, 'Could not export the Ruleset version');
  }
}
