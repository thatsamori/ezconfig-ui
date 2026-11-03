/**
 * GET /api/operator/status
 *
 * The platform operator's status page, computed when it loads
 * (`src/lib/platform/status.ts`): { now, gameServers, activity, health, backup,
 * restoreCheck }. Names no game server or owner.
 *
 * The platform operator only. Reading it changes nothing and is not logged.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { readPlatformStatus } from '@/lib/platform/status';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  try {
    return NextResponse.json(readPlatformStatus(), { headers: NO_STORE });
  } catch (error) {
    log.error('status.read-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not read the platform status' }, { status: 500, headers: NO_STORE });
  }
}
