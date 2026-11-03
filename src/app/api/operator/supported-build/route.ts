/**
 * GET /api/operator/supported-build
 *
 * The Supported build: { supportedBuild: { stamp, setAt, setBy } | null }.
 * `setBy` is the name of the server owner who set it, null once their account
 * is deleted. null while none is set, when nothing is sent to any game server.
 *
 * PUT /api/operator/supported-build  { stamp }
 *
 * Sets it to a build stamp, `YYYYMMDD-HHMMSS`: { supportedBuild }. 400 for
 * anything else. Setting the stamp it already is changes nothing and keeps its
 * set at and set by. Game servers on any other build are sent nothing from
 * then on; their held polls are answered when their hold ends.
 *
 * The platform operator only. Setting it is logged as an operator action,
 * with the stamp.
 */

import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { readBuildStamp, readSupportedBuild, setSupportedBuild } from '@/lib/platform/supported-build';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  try {
    return NextResponse.json({ supportedBuild: readSupportedBuild() }, { headers: NO_STORE });
  } catch (error) {
    log.error('supported-build.read-failed', error, { userId: session.user.id });
    return failure(500, 'Could not read the Supported build');
  }
}

export async function PUT(request: Request) {
  const session = requireOperator(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const body: unknown = await request.json().catch(() => undefined);
    const stamp = readBuildStamp(typeof body === 'object' && body !== null ? (body as { stamp?: unknown }).stamp : undefined);
    if (!stamp.ok) return failure(400, stamp.error);
    if (setSupportedBuild(stamp.stamp, userId)) log.info('supported-build.set', { userId, buildStamp: stamp.stamp });
    return NextResponse.json({ supportedBuild: readSupportedBuild() }, { headers: NO_STORE });
  } catch (error) {
    log.error('supported-build.set-failed', error, { userId });
    return failure(500, 'Could not set the Supported build');
  }
}
