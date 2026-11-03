/**
 * GET /internal/backup-heartbeat
 *
 * Litestream's `heartbeat-url`: records the time of the call for the operator
 * page (`src/lib/platform/backup-heartbeat.ts`) and answers 204.
 *
 * Only the instance itself may call it. Caddy refuses `/internal/*` from
 * outside, and this route refuses any request that did not come straight from
 * loopback: Next sets `X-Forwarded-For` to the socket's address when a request
 * has none, and Caddy sets it to the client's address, so a request through
 * Caddy never carries a loopback address there. The Host must be loopback too.
 *
 * It sits outside `src/app/api/`, whose handlers all require a session.
 */
import { recordBackupHeartbeat } from '@/lib/platform/backup-heartbeat';

export const dynamic = 'force-dynamic';

const LOOPBACK_ADDRESS = /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3})$/i;
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/i;

const fromThisInstance = (headers: Headers) =>
  LOOPBACK_ADDRESS.test(headers.get('x-forwarded-for') ?? '') && LOOPBACK_HOST.test(headers.get('host') ?? '');

export function GET(request: Request) {
  if (!fromThisInstance(request.headers)) return new Response('Forbidden', { status: 403 });
  recordBackupHeartbeat();
  return new Response(null, { status: 204 });
}
