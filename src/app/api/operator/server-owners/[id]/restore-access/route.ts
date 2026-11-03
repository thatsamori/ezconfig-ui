/**
 * POST /api/operator/server-owners/{id}/restore-access
 *
 * Restores a server owner's access: clears the access removed time, so they
 * can sign in again: { serverOwner } as the list shows it. Restoring access
 * that was not removed changes nothing. 404 for no such server owner; 403 for
 * a platform operator, against whom no action is taken.
 *
 * The platform operator only; logged by id when it changes.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { restoreAccess } from '@/lib/platform/server-owners';

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
    const restored = serverOwnerId === undefined ? undefined : restoreAccess(serverOwnerId);
    if (!restored || (!restored.ok && restored.refusal === 'not-found')) return failure(404, 'No server owner has that id');
    if (!restored.ok) {
      log.warn('server-owner.operator-refused', 'Refused to restore a platform operator\'s access', { userId, serverOwnerId });
      return failure(403, 'No action is taken against a platform operator');
    }
    if (restored.changed) log.info('server-owner.access-restored', { userId, serverOwnerId });
    return NextResponse.json({ serverOwner: restored.serverOwner }, { headers: NO_STORE });
  } catch (error) {
    log.error('server-owner.restore-access-failed', error, { userId, serverOwnerId });
    return failure(500, 'Could not restore access');
  }
}
