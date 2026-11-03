/**
 * POST /api/rulesets/import  { file, name?, commit? }
 *
 * Reviews or imports a Ruleset file (src/lib/config/rulesetFile.ts). `file` is
 * the file's text, and `name` the name the owner chose instead of the file's.
 * The file is input from outside: see rulesets.ts.
 *
 * Without `commit: true` it is a review, which writes nothing:
 * - 200 { success, data: ImportReview }: the name, whether it is taken, how many
 *   values, and the values that would be dropped.
 *
 * With it, the file becomes version 1 of a new Ruleset of the owner's, in one
 * transaction. No Draft, Live configuration or game server changes:
 * - 201 { success, data: { ruleset: { id, name }, version: RulesetVersionSummary, values, dropped } },
 *   `dropped` counting the values left out.
 * - 409 { success, error } when the owner already has a Ruleset with the name,
 *   ignoring case: nothing is written.
 *
 * Either way:
 * - 400 { success, error } for a file that is not the format, or a name or
 *   description the rules refuse.
 * - 413 { success, error } for a file over the limit.
 */
import { NextResponse } from 'next/server';
import { RULESET_FILE_LIMIT, RULESET_FILE_TOO_LARGE } from '@/lib/config/rulesetFile';
import { isObject } from '@/lib/config/valuesDocument';
import { requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { importRuleset, readRulesetImport, reviewRulesetImport } from '@/lib/platform/rulesets';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** A file at the limit, escaped as a JSON string, beside a name. */
const BODY_LIMIT = 2 * RULESET_FILE_LIMIT + 1024;
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return failure(413, RULESET_FILE_TOO_LARGE);
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = undefined; }
    if (!isObject(body) || typeof body.file !== 'string') return failure(400, 'Send the text of the Ruleset file');
    if (body.file.length > RULESET_FILE_LIMIT) return failure(413, RULESET_FILE_TOO_LARGE);
    const read = readRulesetImport(body.file, body.name);
    if (!read.ok) return failure(400, read.error);
    if (body.commit !== true) return NextResponse.json({ success: true, data: reviewRulesetImport(userId, read.ruleset) }, { headers: NO_STORE });
    const imported = importRuleset(userId, read.ruleset);
    if (!imported.ok) return failure(409, `You already have a Ruleset called ${imported.takenBy}`);
    const { ruleset, version } = imported;
    log.info('ruleset.imported', { userId, rulesetId: ruleset.id, rulesetVersionId: version.id, count: read.ruleset.dropped.length });
    return NextResponse.json({ success: true, data: { ruleset, version, values: read.ruleset.values, dropped: read.ruleset.dropped.length } }, { status: 201, headers: NO_STORE });
  } catch (error) {
    log.error('ruleset.import-failed', error, { userId });
    return failure(500, 'Could not import the Ruleset file');
  }
}
