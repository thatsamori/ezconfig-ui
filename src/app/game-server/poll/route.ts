/**
 * POST /game-server/poll
 *
 * The poll exchange: a game server's mod long-polls here with its Game server
 * key as a Bearer token. The contract (fields, status codes and every answer)
 * is docs/poll-exchange.md.
 *
 * - A missing or unknown key gets 401 "key-rejected", counted per hour.
 * - A body that breaks the contract gets 400 "bad-request".
 * - Otherwise the poll's report is recorded, and a processed id or result it
 *   reports for the first time is logged. A poll on the Supported build
 *   whose reported processed id is not the game server's Live configuration
 *   (another id, one the platform does not know, or none) is answered at once
 *   with the whole Live configuration: "live-configuration". A game server
 *   with no Live configuration is never sent anything, and one that reports
 *   processing it, Failed included, is not sent it again. A Blocked Live
 *   configuration, one the current schema refuses values in, is never sent:
 *   the poll is held, and the first such poll since the platform started
 *   logs it.
 * - Any other poll is held (50 s) until it is answered "no-change", or
 *   "superseded" by a newer poll, or 401 "key-rejected" when Regenerate key
 *   or Delete ends its key, or "live-configuration" when an Apply wakes it.
 * - A poll whose build stamp is not the Supported build when its hold ends
 *   (or none is set) is answered "not-supported-build" instead of
 *   "no-change" or a Live configuration: such a game server is sent nothing.
 *
 * It sits outside `src/app/api/`, whose handlers all require a session: game
 * servers authenticate by key, and send no cookie or Origin. Routine polls are
 * never logged, and the key is never logged or stored. Each delivery and
 * each new processing result is logged, by id.
 */
import { findGameServerByKey, recordPoll, reportsNewResult } from '@/lib/platform/game-servers';
import { log } from '@/lib/platform/log';
import { readBearerKey, readPollReport, type PollReport } from '@/lib/platform/poll-exchange';
import { pendingDelivery } from '@/lib/platform/live-configurations';
import { answerAtOnce, countRejectedKey, holdPoll, logBlocked, type PollAnswer } from '@/lib/platform/polls';
import { isSupportedBuild, logReportedBuild } from '@/lib/platform/supported-build';

const answer = (body: PollAnswer | { answer: 'bad-request'; error: string } | { answer: 'error' }, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const keyRejected = () => {
  countRejectedKey();
  return answer({ answer: 'key-rejected' }, 401);
};

const deliver = (gameServerId: number, delivery: Extract<PollAnswer, { answer: 'live-configuration' }>) => {
  log.info('live-configuration.delivered', { gameServerId, liveConfigurationId: delivery.liveConfigurationId });
  return answer(delivery);
};

/** The form of the ids the platform makes (a UUID); a poll may report any text as one. */
const LIVE_CONFIGURATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A processing result, once, when the game server first reports it: by ids, never the mod's error or a key name. */
const logResult = (gameServerId: number, { liveConfigurationId, result }: NonNullable<PollReport['processed']>) => {
  const ids = LIVE_CONFIGURATION_ID.test(liveConfigurationId) ? { gameServerId, liveConfigurationId } : { gameServerId };
  const ignored = result.unknownKeys.length;
  if (result.failure) log.warn('live-configuration.failed', 'The game server reports that processing stopped at a failed command', ids);
  else if (ignored) log.warn('live-configuration.keys-ignored', `The game server's build ignored ${ignored} key${ignored === 1 ? '' : 's'} it does not know`, ids);
  else log.info('live-configuration.processed', ids);
};

export async function POST(request: Request) {
  let gameServerId: number | undefined;
  try {
    const key = readBearerKey(request);
    const lookUp = () => key === undefined ? undefined : findGameServerByKey(key);
    const known = lookUp();
    if (!known) return keyRejected();
    gameServerId = known.id;
    const body = await request.text();
    // Regenerate key or Delete may have ended the key while the body arrived, so it is looked up
    // again. Nothing awaits from here to the hold: no poll is ever held on a key that has ended.
    const server = lookUp();
    if (!server) return keyRejected();
    const read = readPollReport(body);
    if (!read.ok) {
      log.warn('poll.bad-request', read.error, { gameServerId });
      return answer({ answer: 'bad-request', error: read.error }, 400);
    }
    logReportedBuild(server, read.report.buildStamp);
    if (read.report.processed && reportsNewResult(server, read.report.processed)) logResult(server.id, read.report.processed);
    recordPoll(server, read.report);
    const delivery = isSupportedBuild(read.report.buildStamp) ? pendingDelivery(server.id, read.report.processed?.liveConfigurationId ?? null) : undefined;
    // Blocked: held as if there were nothing to send, until an Apply of the fixed Draft wakes it.
    if (delivery && 'blocked' in delivery) logBlocked(server.id, delivery.blocked);
    else if (delivery) {
      answerAtOnce(server.id, read.report.instanceId);
      return deliver(server.id, delivery);
    }
    const held = await holdPoll(server.id, read.report.instanceId, request.signal);
    if (held.answer === 'key-rejected') return answer(held, 401);
    if (held.answer === 'superseded') return answer(held);
    // Decided when the hold ends: the Supported build may have changed meanwhile.
    if (!isSupportedBuild(read.report.buildStamp)) return answer({ answer: 'not-supported-build' });
    return held.answer === 'live-configuration' ? deliver(server.id, held) : answer(held);
  } catch (error) {
    log.error('poll.failed', error, gameServerId === undefined ? {} : { gameServerId });
    return answer({ answer: 'error' }, 500);
  }
}
