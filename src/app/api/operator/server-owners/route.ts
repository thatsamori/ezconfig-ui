/**
 * GET /api/operator/server-owners
 *
 * Every server owner, in the order they first signed in: { serverOwners: [{
 * id, name, avatarUrl, firstSignedInAt, lastSeenAt, gameServers,
 * accessRemovedAt, operator }] }. `gameServers` is a count: nothing of an
 * owner's game servers, Drafts, Live configurations or Rulesets is returned.
 * `lastSeenAt` is null while they have no session.
 *
 * The platform operator only.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { listServerOwners } from '@/lib/platform/server-owners';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  try {
    return NextResponse.json({ serverOwners: listServerOwners() }, { headers: NO_STORE });
  } catch (error) {
    log.error('server-owner.list-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not list server owners' }, { status: 500, headers: NO_STORE });
  }
}
