/**
 * POST /api/game-servers/:id/regenerate-key
 *
 * Replaces one of the signed-in owner's game servers' Game server key, after
 * the page's confirm: { success, data: { gameServer, key } }. `key` is the new
 * key, in this response and never again. The old key ends at once, with no
 * grace period: a poll held on it is answered "key-rejected", and the game
 * server is Not connected until it polls with the new key. 404 for an id that
 * is not one of theirs, whoever's it is.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { gameServerView, regenerateGameServerKey } from '@/lib/platform/game-servers';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const { id } = await params;
    const regenerated = /^[1-9]\d{0,15}$/.test(id) ? regenerateGameServerKey(userId, Number(id)) : undefined;
    if (!regenerated) return NextResponse.json({ success: false, error: 'No such game server' }, { status: 404, headers: NO_STORE });
    log.info('game-server.key-regenerated', { userId, gameServerId: regenerated.gameServer.id });
    return NextResponse.json({ success: true, data: { gameServer: gameServerView(regenerated.gameServer), key: regenerated.key } }, { headers: NO_STORE });
  } catch (error) {
    log.error('game-server.regenerate-key-failed', error, { userId });
    return NextResponse.json({ success: false, error: 'Could not regenerate the key' }, { status: 500, headers: NO_STORE });
  }
}
