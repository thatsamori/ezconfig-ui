/**
 * GET /api/game-servers
 *   The signed-in owner's game servers by name, each with its connection
 *   status: { success, data: GameServerView[] }. The list refreshes this about
 *   every 2 s.
 *
 * POST /api/game-servers  { name }
 *   Registers a game server with an empty Draft: 201 { success, data: { gameServer, key } }.
 *   `key` is the Game server key, in this response and never again. 409 when
 *   the owner already has a game server of that name, ignoring case; 400 for
 *   a name that is empty, longer than 64 characters or has control characters.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { gameServerView, listGameServers, readGameServerName, registerGameServer } from '@/lib/platform/game-servers';
import { log } from '@/lib/platform/log';

const NO_STORE = { 'Cache-Control': 'no-store' };
const failure = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const now = Date.now();
    return NextResponse.json({ success: true, data: listGameServers(session.user.id).map(server => gameServerView(server, now)) }, { headers: NO_STORE });
  } catch (error) {
    log.error('game-server.list-failed', error, { userId: session.user.id });
    return failure(500, 'Could not load your game servers');
  }
}

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const body: unknown = await request.json().catch(() => undefined);
    const name = readGameServerName(typeof body === 'object' && body !== null ? (body as { name?: unknown }).name : undefined);
    if (!name.ok) return failure(400, name.error);
    const registration = registerGameServer(userId, name);
    if (!registration.ok) return failure(409, `You already have a game server called ${registration.takenBy}`);
    log.info('game-server.registered', { userId, gameServerId: registration.gameServer.id });
    return NextResponse.json(
      { success: true, data: { gameServer: gameServerView(registration.gameServer), key: registration.key } },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    log.error('game-server.register-failed', error, { userId });
    return failure(500, 'Could not register the game server');
  }
}
