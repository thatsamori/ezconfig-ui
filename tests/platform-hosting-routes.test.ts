import { afterEach, expect, spyOn, test } from 'bun:test';
import { GET as heartbeat } from '../src/app/internal/backup-heartbeat/route';
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
