/**
 * GET /api/game-servers/:id
 *
 * One of the signed-in owner's game servers, with its connection status and
 * what its latest poll reported: { success, data: GameServerView }. Never the
 * key. 404 for an id that is not one of theirs, whoever's it is. The server
 * page refreshes this about every 2 s.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { findOwnedGameServer, gameServerView } from '@/lib/platform/game-servers';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const { id } = await params;
    const server = /^[1-9]\d{0,15}$/.test(id) ? findOwnedGameServer(session.user.id, Number(id)) : undefined;
    if (!server) return NextResponse.json({ success: false, error: 'No such game server' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ success: true, data: gameServerView(server) }, { headers: NO_STORE });
  } catch (error) {
    log.error('game-server.read-failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not load the game server' }, { status: 500, headers: NO_STORE });
  }
}
