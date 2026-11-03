/**
 * POST /api/operator/server-owners/{id}/remove-access
 *
 * Removes a server owner's access, reversibly: sets the access removed time
 * and ends every session they have, so sign-in refuses them, even with an
 * Invite. Their data stays and their game servers are still answered:
 * { serverOwner } as the list shows it. Removing access already removed keeps
 * its time. 404 for no such server owner; 403 for a platform operator.
 *
 * The platform operator only; logged by id when it changes.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { removeAccess } from '@/lib/platform/server-owners';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  const { id } = await params;
  const serverOwnerId = /^[1-9]\d{0,15}$/.test(id) ? Number(id) : undefined;
  try {
    const removed = serverOwnerId === undefined ? undefined : removeAccess(serverOwnerId);
    if (!removed || (!removed.ok && removed.refusal === 'not-found')) return failure(404, 'No server owner has that id');
    if (!removed.ok) {
      log.warn('server-owner.operator-refused', 'Refused to remove a platform operator\'s access', { userId, serverOwnerId });
      return failure(403, 'A platform operator\'s access cannot be removed');
    }
    if (removed.changed) log.info('server-owner.access-removed', { userId, serverOwnerId });
    return NextResponse.json({ serverOwner: removed.serverOwner }, { headers: NO_STORE });
  } catch (error) {
    log.error('server-owner.remove-access-failed', error, { userId, serverOwnerId });
    return failure(500, 'Could not remove access');
  }
}
