/**
 * DELETE /api/operator/server-owners/{id}  { confirm }
 *
 * Deletes a server owner, for an erasure request, once `confirm` is their name
 * as the list shows it (the typed confirm): their game servers with Drafts and
 * Live configurations, their Rulesets, the Invites they used, and their
 * sessions. Their Notes stay, and those and the Supported build if they set
 * it read "a former server owner". Polls held on their game servers' keys are
 * answered "key-rejected": { success }. 400 when `confirm` is not their name;
 * 404 for no such server owner; 403 for a platform operator.
 *
 * The platform operator only; logged by id, with how many game servers went.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { deleteServerOwner } from '@/lib/platform/server-owners';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  const { id } = await params;
  const serverOwnerId = /^[1-9]\d{0,15}$/.test(id) ? Number(id) : undefined;
  try {
    const body: unknown = await request.json().catch(() => undefined);
    const confirm = typeof body === 'object' && body !== null ? (body as { confirm?: unknown }).confirm : undefined;
    const deleted = serverOwnerId === undefined ? undefined : deleteServerOwner(serverOwnerId, typeof confirm === 'string' ? confirm : '');
    if (!deleted || (!deleted.ok && deleted.refusal === 'not-found')) return failure(404, 'No server owner has that id');
    if (!deleted.ok && deleted.refusal === 'operator') {
      log.warn('server-owner.operator-refused', 'Refused to delete a platform operator', { userId, serverOwnerId });
      return failure(403, 'A platform operator cannot be deleted');
    }
    if (!deleted.ok) return failure(400, 'Type the server owner\'s name to delete them');
    log.info('server-owner.deleted', { userId, serverOwnerId, count: deleted.gameServers });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    log.error('server-owner.delete-failed', error, { userId, serverOwnerId });
    return failure(500, 'Could not delete the server owner');
  }
}
