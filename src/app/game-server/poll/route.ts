/**
 * POST /game-server/poll
 *
 * The poll exchange: a game server's mod long-polls here with its Game server
 * key as a Bearer token. The contract (fields, status codes and every answer)
 * is docs/poll-exchange.md.
 *
 * - A missing or unknown key gets 401 "key-rejected", counted per hour.
 * - A body that breaks the contract gets 400 "bad-request".
 * - Otherwise the poll's report is recorded and the poll is held (50 s) until
 *   it is answered "no-change", or "superseded" by a newer poll.
 *
 * It sits outside `src/app/api/`, whose handlers all require a session: game
 * servers authenticate by key, and send no cookie or Origin. Routine polls are
 * never logged, and the key is never logged or stored.
 */
import { findGameServerByKey, recordPoll } from '@/lib/platform/game-servers';
import { log } from '@/lib/platform/log';
import { readBearerKey, readPollReport } from '@/lib/platform/poll-exchange';
import { countRejectedKey, holdPoll, type PollAnswer } from '@/lib/platform/polls';

const answer = (body: PollAnswer | { answer: 'bad-request'; error: string } | { answer: 'error' }, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  let gameServerId: number | undefined;
  try {
    const key = readBearerKey(request);
    const server = key === undefined ? undefined : findGameServerByKey(key);
    if (!server) {
      countRejectedKey();
      return answer({ answer: 'key-rejected' }, 401);
    }
    gameServerId = server.id;
    const read = readPollReport(await request.text());
    if (!read.ok) {
      log.warn('poll.bad-request', read.error, { gameServerId });
      return answer({ answer: 'bad-request', error: read.error }, 400);
    }
    recordPoll(server, read.report);
    return answer(await holdPoll(server.id, read.report.instanceId, request.signal));
  } catch (error) {
    log.error('poll.failed', error, gameServerId === undefined ? {} : { gameServerId });
    return answer({ answer: 'error' }, 500);
  }
}
