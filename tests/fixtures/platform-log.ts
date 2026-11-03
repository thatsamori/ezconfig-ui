// Child fixture for tests/platform-log.test.ts: runs one logging scenario, then prints the health snapshot last.
import { log, readLogHealth, type LogIds } from '../../src/lib/platform/log';

const scenarios: Record<string, () => void> = {
  info: () => log.info('apply', { userId: 'user-1', gameServerId: 7, liveConfigurationId: 'live-3' }),
  'record-as-ids': () => {
    // A caller handing over a whole row by mistake; only the type check stands in its way at compile time.
    const row = { gameServerId: 7, name: 'Duel Yard', keyHash: 'hash-of-key', userId: { username: 'discord-name' } };
    log.info('game-server.registered', row as unknown as LogIds);
    // A count is a number or nothing.
    log.info('poll.key-rejected', { count: 3 });
    log.info('poll.key-rejected', { count: 'ezconfig-count-text' } as unknown as LogIds);
    // A build stamp only in its YYYYMMDD-HHMMSS form: a poll may report any text.
    log.info('poll.not-supported-build', { gameServerId: 7, buildStamp: '20261102-153000' });
    log.info('poll.not-supported-build', { gameServerId: 7, buildStamp: 'ezconfig-stamp-text' });
  },
  problems: () => {
    log.error('delivery.failed', Object.assign(new Error('delivery failed'), {
      request: { headers: { cookie: 'session=cookie-value' } },
      config: { DamageMultiplier: 'config-value-1.5' },
      cause: new Error('inner-cause-text'),
    }), { gameServerId: 7 });
    log.warn('key.shared', 'More than one server is using this key', { gameServerId: 7 });
    log.error('poll.failed', { message: 'shaped like an error', stack: 'at poll', token: 'object-token-1' });
    log.error('crash', { headers: { authorization: 'Bearer object-token-2' } });
  },
  'planted-secrets': () => {
    const key = process.env.PLANTED_KEY!;
    const secret = process.env.DISCORD_CLIENT_SECRET!;
    log.info(`sign-in ${secret}`, { userId: key });
    log.warn('key.rejected', `GameServerKey=${key} rejected`, { gameServerId: 7 });
    log.error('discord.exchange.failed', Object.assign(
      new Error(`token exchange failed for client_secret=${secret} and ${key.slice(0, 20)}`),
      { body: secret },
    ));
  },
  health: () => {
    log.info('startup');
    log.info('sign-in', { userId: 'user-1' });
    for (let index = 1; index <= 24; index++) (index % 3 === 0 ? log.error : log.warn)(`problem.${index}`, `problem ${index}`);
    log.warn('key.rejected', `rejected ${process.env.PLANTED_KEY}`, { gameServerId: 7 });
  },
};

const scenario = scenarios[process.argv[2]];
if (!scenario) throw new Error(`Unknown scenario: ${process.argv[2]}`);
scenario();
process.stdout.write(`${JSON.stringify({ fixtureHealth: readLogHealth() })}\n`);
