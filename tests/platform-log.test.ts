import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { LogHealth } from '../src/lib/platform/log';

type Line = Record<string, unknown> & { time: string };

// The env must be set before the logging module loads, so each scenario runs in a child.
function run(scenario: string, env: Record<string, string> = {}) {
  const result = Bun.spawnSync([process.execPath, '--no-env-file', 'run', 'tests/fixtures/platform-log.ts', scenario], {
    stdout: 'pipe', stderr: 'pipe', env: { ...process.env, DISCORD_CLIENT_SECRET: '', ...env },
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) throw new Error(`fixture exited ${result.exitCode}\n${stderr}`);
  const lines = (text: string) => text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Line);
  const out = lines(stdout);
  const health = out.pop()?.fixtureHealth as LogHealth;
  return { stdout, stderr, out, err: lines(stderr), health };
}

const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));
const plantedKey = () => `ezc_gsk_${randomBytes(32).toString('base64url')}`;

test('an info event is one JSON line on stdout with its time, level, event and platform ids', () => {
  const before = Date.now();
  const { out, err } = run('info');
  expect(err).toEqual([]);
  expect(out).toHaveLength(1);
  expect(Date.parse(out[0].time)).toBeGreaterThanOrEqual(before - 1000);
  expect(without(out[0], 'time')).toEqual({ level: 'info', event: 'apply', userId: 'user-1', gameServerId: 7, liveConfigurationId: 'live-3' });
});

test('a whole record passed as ids keeps only its platform ids', () => {
  const { out, stdout } = run('record-as-ids');
  expect(out.map(line => without(line, 'time'))).toEqual([{ level: 'info', event: 'game-server.registered', gameServerId: 7 }]);
  for (const leaked of ['Duel Yard', 'hash-of-key', 'discord-name']) expect(stdout).not.toContain(leaked);
});

test('warnings and errors go to stderr, and an error is reduced to its message and stack', () => {
  const { out, err, stdout, stderr } = run('problems');
  expect(out).toEqual([]);
  expect(err.map(line => without(line, 'time', 'stack'))).toEqual([
    { level: 'error', event: 'delivery.failed', gameServerId: 7, message: 'delivery failed' },
    { level: 'warn', event: 'key.shared', gameServerId: 7, message: 'More than one server is using this key' },
    { level: 'error', event: 'poll.failed', message: 'shaped like an error' },
    { level: 'error', event: 'crash', message: '[object not logged]' },
  ]);
  expect(err[0].stack).toContain('platform-log');
  expect(err.map(line => 'stack' in line)).toEqual([true, false, true, false]);
  for (const leaked of ['cookie-value', 'config-value-1.5', 'inner-cause-text', 'object-token']) expect(stdout + stderr).not.toContain(leaked);
});

test('a planted game server key and the configured client secret are redacted from stdout and stderr', () => {
  const key = plantedKey();
  const secret = randomBytes(24).toString('base64url');
  const { out, err, stdout, stderr } = run('planted-secrets', { PLANTED_KEY: key, DISCORD_CLIENT_SECRET: secret });
  for (const part of [secret, key.slice(8), key.slice(8, 20), key.slice(-8)]) expect(stdout + stderr).not.toContain(part);
  expect(out.map(line => without(line, 'time'))).toEqual([{ level: 'info', event: 'sign-in [redacted]', userId: '[redacted]' }]);
  expect(err.map(line => line.message)).toEqual([
    'GameServerKey=[redacted] rejected',
    'token exchange failed for client_secret=[redacted] and [redacted]',
  ]);
  expect(err[1].stack).toContain('[redacted]');
});

test('health counts warnings and errors since start and keeps the newest 20, scrubbed and without ids', () => {
  const { err, health } = run('health', { PLANTED_KEY: plantedKey() });
  // Scenario: 2 info events, problem.1..24 with every third an error, then one warning naming a key.
  expect(health).toMatchObject({ warnings: 17, errors: 8 });
  expect(health.recent.map(entry => entry.event)).toEqual(['key.rejected', ...Array.from({ length: 19 }, (_, index) => `problem.${24 - index}`)]);
  expect(health.recent[0]).toEqual({ time: err.at(-1)!.time, level: 'warn', event: 'key.rejected', message: 'rejected [redacted]' });
  expect(health.recent[1]).toEqual({ time: err.at(-2)!.time, level: 'error', event: 'problem.24', message: 'problem 24' });
});
