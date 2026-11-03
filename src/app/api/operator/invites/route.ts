/**
 * GET /api/operator/invites
 *
 * The unused Invites, newest first: { invites: [{ id, madeAt, expiresAt }] }.
 * Used, revoked and expired ones are left out.
 *
 * POST /api/operator/invites
 *
 * Makes an Invite that expires in 7 days: 201 { invite, link }. The link holds
 * the code, and this answer is the only place it is ever shown.
 *
 * The platform operator only. Making an Invite is logged by its id; a code or
 * link never is.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { listUnusedInvites, makeInvite } from '@/lib/platform/invites';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  try {
    return NextResponse.json({ invites: listUnusedInvites() }, { headers: NO_STORE });
  } catch (error) {
    log.error('invite.list-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not list Invites' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  try {
    const { invite, link } = makeInvite(session.user.id);
    log.info('invite.made', { userId: session.user.id, inviteId: invite.id });
    return NextResponse.json({ invite, link }, { status: 201, headers: NO_STORE });
  } catch (error) {
    log.error('invite.make-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not make an Invite' }, { status: 500 });
  }
}
