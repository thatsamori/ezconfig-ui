/**
 * POST /api/operator/invites/{id}/revoke
 *
 * Revokes an unused Invite, so its link stops working: it sets the revoked
 * time and keeps the row, which the daily sweep deletes 30 days later. 404
 * when the list shows no Invite with that id (used, revoked, expired or none).
 *
 * The platform operator only; logged by the Invite's id.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { revokeInvite } from '@/lib/platform/invites';
import { log } from '@/lib/platform/log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const inviteId = /^\d{1,15}$/.test(id) ? Number(id) : undefined;
  try {
    if (inviteId === undefined || !revokeInvite(inviteId)) {
      return NextResponse.json({ success: false, error: 'No unused Invite has that id' }, { status: 404 });
    }
    log.info('invite.revoked', { userId: session.user.id, inviteId });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('invite.revoke-failed', error, { userId: session.user.id, inviteId });
    return NextResponse.json({ success: false, error: 'Could not revoke the Invite' }, { status: 500 });
  }
}
