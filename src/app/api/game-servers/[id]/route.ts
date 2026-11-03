/**
 * GET /api/game-servers/:id
 *
 * One of the signed-in owner's game servers, with its connection status and
 * what its latest poll reported: { success, data: GameServerView }. Never the
 * key. 404 for an id that is not one of theirs, whoever's it is. The server
 * page refreshes this about every 2 s.
 *
 * DELETE /api/game-servers/:id
 *
 * Deletes one of the signed-in owner's game servers, after the page's
 * confirm, with its key, its Draft and its Live configuration: { success }.
 * The owner's Rulesets stay. A poll held on its key is answered
 * "key-rejected". 404 for an id that is not one of theirs.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/platform/auth';
import { deleteGameServer, findOwnedGameServer, gameServerView } from '@/lib/platform/game-servers';
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const userId = session.user.id;
  try {
    const { id } = await params;
    if (!/^[1-9]\d{0,15}$/.test(id) || !deleteGameServer(userId, Number(id))) {
      return NextResponse.json({ success: false, error: 'No such game server' }, { status: 404, headers: NO_STORE });
    }
    log.info('game-server.deleted', { userId, gameServerId: Number(id) });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    log.error('game-server.delete-failed', error, { userId });
    return NextResponse.json({ success: false, error: 'Could not delete the game server' }, { status: 500, headers: NO_STORE });
  }
}
