import { afterEach, expect, spyOn, test } from 'bun:test';
import { GET as heartbeat } from '../src/app/internal/backup-heartbeat/route';
import { POST as heldPost } from '../src/app/proof/held-post/route';
import { BACKUP_HEARTBEAT_STALE_MS, readLastBackupHeartbeat, recordBackupHeartbeat } from '../src/lib/platform/backup-heartbeat';

// Next sets X-Forwarded-For to the socket's address when a request has none; Caddy sets it to the client's.
const heartbeatFrom = (headers: Record<string, string>) => heartbeat(new Request('http://127.0.0.1:3000/internal/backup-heartbeat', { headers }));
const local = { host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' };

const stdoutWrites = spyOn(process.stdout, 'write');
const loggedEvents = () => stdoutWrites.mock.calls.map(([chunk]) => String(chunk)).filter(text => text.startsWith('{')).map(text => (JSON.parse(text) as { event: string }).event);
afterEach(() => stdoutWrites.mockClear());

// The refusals run first: the heartbeat lives in process memory, so nothing may be recorded before them.
test('the heartbeat route refuses any request that did not come straight from loopback', async () => {
  const refused: Record<string, string>[] = [
    { host: 'platform.example.com', 'x-forwarded-for': '203.0.113.9' }, // through Caddy
    { host: '127.0.0.1:3000', 'x-forwarded-for': '203.0.113.9' },
    { host: 'platform.example.com', 'x-forwarded-for': '127.0.0.1' },
    { host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1, 203.0.113.9' },
    { host: '127.0.0.1:3000', 'x-forwarded-for': '10.0.0.5' },
    { host: '127.0.0.1:3000' },
    { 'x-forwarded-for': '127.0.0.1' },
  ];
  for (const headers of refused) expect({ headers, status: (await heartbeatFrom(headers)).status }).toEqual({ headers, status: 403 });
  expect(readLastBackupHeartbeat()).toBeNull();
  expect(loggedEvents()).toEqual([]);
});

test('a heartbeat from loopback is recorded, and only the first since start is logged', async () => {
  const before = Date.now();
  const response = await heartbeatFrom(local);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  const first = readLastBackupHeartbeat()!;
  expect(first.getTime()).toBeGreaterThanOrEqual(before);
  expect(first.getTime()).toBeLessThanOrEqual(Date.now());

  for (const headers of [{ host: 'localhost:3000', 'x-forwarded-for': '::1' }, { host: '[::1]:3000', 'x-forwarded-for': '::ffff:127.0.0.1' }]) {
    expect((await heartbeatFrom(headers)).status).toBe(204);
  }
  expect(readLastBackupHeartbeat()!.getTime()).toBeGreaterThanOrEqual(first.getTime());
  expect(loggedEvents()).toEqual(['backup.heartbeat.first']);
});

test('a heartbeat after a stale gap is logged as resumed', () => {
  const last = readLastBackupHeartbeat()!.getTime();
  recordBackupHeartbeat(last + BACKUP_HEARTBEAT_STALE_MS);
  expect(loggedEvents()).toEqual([]);
  recordBackupHeartbeat(last + 2 * BACKUP_HEARTBEAT_STALE_MS + 1);
  expect(loggedEvents()).toEqual(['backup.heartbeat.resumed']);
  expect(readLastBackupHeartbeat()!.getTime()).toBe(last + 2 * BACKUP_HEARTBEAT_STALE_MS + 1);
});

const post = (body?: string) => heldPost(new Request('http://127.0.0.1:3000/proof/held-post', { method: 'POST', body, headers: { 'content-type': 'application/json' } }));

test('the held-POST proof route holds for holdSeconds, then answers with the time held and the runtime', async () => {
  const started = performance.now();
  const response = await post(JSON.stringify({ holdSeconds: 1 }));
  const elapsed = performance.now() - started;
  expect(response.status).toBe(200);
  const body = await response.json() as { heldMs: number; runtime: string };
  expect(body.heldMs).toBeGreaterThanOrEqual(990);
  expect(elapsed).toBeGreaterThanOrEqual(990);
  expect(elapsed).toBeLessThan(5000);
  expect(body.runtime).toBe(`bun ${Bun.version}`);
});

test('the held-POST proof route refuses a hold outside 1 to 120 whole seconds at once', async () => {
  const started = performance.now();
  for (const body of ['{"holdSeconds":0}', '{"holdSeconds":121}', '{"holdSeconds":1.5}', '{"holdSeconds":"5"}', 'null', 'not json']) {
    const response = await post(body);
    expect({ body, status: response.status }).toEqual({ body, status: 400 });
    expect((await response.json() as { error: string }).error).toBe('holdSeconds must be a whole number from 1 to 120');
  }
  expect(performance.now() - started).toBeLessThan(1000);
});
