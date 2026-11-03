/**
 * Invites through the route handlers (online-platform#25): the platform
 * operator makes, lists and revokes them, sign-in with Discord spends them,
 * and the daily sweep tidies expired sessions and old Invite rows. One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-invites.test.ts. Discord's OAuth exchange is replaced.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the secrets it
 * handled (Invite codes and links, session tokens, Discord ids, names and OAuth
 * codes) so the test can check that no log line holds any of them.
 */
import { jest, mock, setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { DiscordUser } from '../../src/lib/platform/discord';

const OPERATOR = { id: '80351110224678912', username: 'opuser', global_name: 'Op Erator', avatar: null };
const NEWCOMER = { id: '41771983423143937', username: 'newcomer-name', global_name: 'New Comer', avatar: null };
const SECOND = { id: '53908232506183680', username: 'second-name', global_name: null, avatar: null };
const THIRD = { id: '61234567890123456', username: 'third-name', global_name: null, avatar: null };
const ACCOUNTS: Record<string, DiscordUser> = { 'operator-code': OPERATOR, 'newcomer-code': NEWCOMER, 'second-code': SECOND, 'third-code': THIRD };

const scenario = process.argv[2];
const secrets = new Set<string>([OPERATOR, NEWCOMER, SECOND, THIRD].flatMap(account => [account.id, account.username, account.global_name ?? '']).filter(Boolean).concat(Object.keys(ACCOUNTS)));
mock.module('../../src/lib/platform/discord', () => ({
  exchangeDiscordCode: async (code: string) => {
    const account = ACCOUNTS[code];
    if (!account) throw new Error('Discord refused the code');
    return account;
  },
}));

const { env } = await import('../../src/lib/env');
const { INVITE_COOKIE, SESSION_COOKIE, SIGN_IN_STATE_COOKIE } = await import('../../src/lib/platform/auth');
const { platformStore } = await import('../../src/lib/platform/storage');
const { GET: startSignIn } = await import('../../src/app/api/auth/discord/route');
const { GET: callback } = await import('../../src/app/api/auth/discord/callback/route');
const { GET: session } = await import('../../src/app/api/auth/session/route');
const { GET: listRoute, POST: makeRoute } = await import('../../src/app/api/operator/invites/route');
const { POST: revokeRoute } = await import('../../src/app/api/operator/invites/[id]/revoke/route');
const ORIGIN = new URL(env.publicUrl).origin;
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

type Invite = { id: number; madeAt: number; expiresAt: number };
type Options = { token?: string; origin?: string | null; method?: string; cookie?: string };
function request(path: string, { token, origin = ORIGIN, method = 'GET', cookie }: Options = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.append('Cookie', `${SESSION_COOKIE}=${token}`);
  if (cookie) headers.append('Cookie', cookie);
  if (origin) headers.set('Origin', origin);
  return new Request(new URL(path, env.publicUrl), { method, headers });
}
const cookieNamed = (response: Response, name: string) => response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined) => cookie?.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
const rows = <Row>(sql: string, ...params: (string | number)[]) => platformStore().all<Row>(sql, ...params);
const codeOf = (link: string) => new URL(link).searchParams.get('invite')!;
const pathOf = (link: string) => new URL(link).pathname + new URL(link).search;
const stateOf = (start: Response) => new URL(start.headers.get('Location')!).searchParams.get('state')!;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const usedInviteCookie = `${INVITE_COOKIE}=; Path=/api/auth/discord; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** A browser opening an Invite link (or pressing the plain sign-in button) and coming back from Discord as `code`'s account. */
async function signInAs(code: string, link?: string) {
  const start = await startSignIn(request(link ? pathOf(link) : '/api/auth/discord', { origin: null }));
  assert.equal(start.status, 303);
  const state = stateOf(start), invite = cookieNamed(start, INVITE_COOKIE);
  if (link) assert(!start.headers.get('Location')!.includes(codeOf(link)), 'the code never goes to Discord');
  const cookie = [`${SIGN_IN_STATE_COOKIE}=${state}`, ...(invite ? [`${INVITE_COOKIE}=${valueOf(invite)}`] : [])].join('; ');
  const response = await callback(request(`/api/auth/discord/callback?code=${code}&state=${state}`, { origin: null, cookie }));
  assert.equal(response.status, 303);
  if (invite) assert.equal(cookieNamed(response, INVITE_COOKIE), usedInviteCookie, 'the Invite cookie is used once');
  const token = valueOf(cookieNamed(response, SESSION_COOKIE));
  if (token) secrets.add(token);
  return { start, invite, response, redirect: response.headers.get('Location'), token };
}
async function signedIn(code: string, link?: string) {
  const { redirect, token } = await signInAs(code, link);
  assert.equal(redirect, '/');
  return token!;
}
async function refusedInviteOnly(code: string, link?: string) {
  const refused = await signInAs(code, link);
  assert.equal(refused.redirect, '/?sign-in=invite-only');
  assert.equal(refused.token, undefined, 'no session cookie');
  return refused;
}
const sessionStatus = async (token: string) => (await session(request('/api/auth/session', { token }))).status;

async function make(token: string): Promise<{ invite: Invite; link: string }> {
  const response = await makeRoute(request('/api/operator/invites', { method: 'POST', token }));
  assert.equal(response.status, 201);
  const made = await response.json();
  secrets.add(made.link).add(codeOf(made.link));
  return made;
}
async function list(token: string): Promise<Invite[]> {
  const response = await listRoute(request('/api/operator/invites', { token }));
  assert.equal(response.status, 200);
  return (await response.json()).invites;
}
const revoke = (token: string, id: number | string, origin?: string | null) =>
  revokeRoute(request(`/api/operator/invites/${id}/revoke`, { method: 'POST', token, origin }), { params: Promise.resolve({ id: String(id) }) });

/** The bytes of the database and its write-ahead log. */
function storedBytes() {
  return [env.databasePath, `${env.databasePath}-wal`].filter(existsSync).map(path => readFileSync(path).toString('latin1')).join('');
}

const scenarios: Record<string, () => Promise<void>> = {
  /** Only the platform operator makes, lists and revokes Invites; a server owner is refused and changes nothing. */
  async 'operator-only'() {
    const operator = await signedIn('operator-code');
    const [first, spare] = [await make(operator), await make(operator)];
    const owner = await signedIn('newcomer-code', first.link);
    assert.equal((await (await session(request('/api/auth/session', { token: owner }))).json()).user.operator, false);

    const attempts = [
      () => listRoute(request('/api/operator/invites', { token: owner })),
      () => makeRoute(request('/api/operator/invites', { method: 'POST', token: owner })),
      () => revoke(owner, spare.invite.id),
    ];
    for (const attempt of attempts) {
      const refused = await attempt();
      assert.equal(refused.status, 403);
      assert.deepEqual(await refused.json(), { success: false, error: 'Only the platform operator can do this' });
    }
    assert.deepEqual(await list(operator), [spare.invite], 'a refused server owner makes and revokes nothing');

    // Without a session, or from another site, even the operator's own session is refused.
    assert.equal((await listRoute(request('/api/operator/invites'))).status, 401);
    assert.equal((await makeRoute(request('/api/operator/invites', { method: 'POST' }))).status, 401);
    assert.equal((await makeRoute(request('/api/operator/invites', { method: 'POST', token: operator, origin: 'https://elsewhere.example' }))).status, 403);
    assert.equal((await revoke(operator, spare.invite.id, null)).status, 403);
    assert.deepEqual(await list(operator), [spare.invite]);

    assert.equal((await revoke(operator, spare.invite.id)).status, 200);
    assert.deepEqual(await list(operator), []);
  },

  /** Making shows the link once; only the code's hash is stored, with made by, made time and a 7-day expiry. The list and revoke. */
  async make() {
    const t0 = Date.UTC(2026, 10, 2, 12);
    setSystemTime(t0);
    const operator = await signedIn('operator-code');
    const response = await makeRoute(request('/api/operator/invites', { method: 'POST', token: operator }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const first = await response.json();
    secrets.add(first.link).add(codeOf(first.link));
    assert.deepEqual(first.invite, { id: 1, madeAt: t0, expiresAt: t0 + 7 * DAY });
    assert.match(first.link, /^https:\/\/ezconfig\.test\/api\/auth\/discord\?invite=[\w-]{43}$/);
    setSystemTime(t0 + HOUR);
    const second = await make(operator);
    assert.notEqual(codeOf(second.link), codeOf(first.link));

    // The list shows each unused Invite with its expiry, newest first, and never a code or link.
    const listed = await listRoute(request('/api/operator/invites', { token: operator }));
    assert.equal(listed.headers.get('Cache-Control'), 'no-store');
    const text = await listed.text();
    assert.deepEqual(JSON.parse(text), { invites: [second.invite, first.invite] });
    for (const made of [first, second]) assert(!text.includes(codeOf(made.link)), 'the list holds no code');

    // At rest: the code's hash, who made it and when, and the expiry. The code itself is stored nowhere.
    assert.deepEqual(rows('SELECT * FROM invites ORDER BY id'), [
      { id: 1, code_hash: sha256(codeOf(first.link)), made_by: 1, made_at: t0, expires_at: t0 + 7 * DAY, used_by: null, used_at: null, revoked_at: null },
      { id: 2, code_hash: sha256(codeOf(second.link)), made_by: 1, made_at: t0 + HOUR, expires_at: t0 + HOUR + 7 * DAY, used_by: null, used_at: null, revoked_at: null },
    ]);
    const bytes = storedBytes();
    for (const made of [first, second]) assert(!bytes.includes(codeOf(made.link)), 'the code is stored nowhere');

    // Revoking sets the revoked time and keeps the row; the list leaves it out.
    setSystemTime(t0 + 2 * HOUR);
    const revoked = await revoke(operator, 1);
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { success: true });
    assert.deepEqual(await list(operator), [second.invite]);
    assert.deepEqual(rows('SELECT id, revoked_at FROM invites ORDER BY id'), [{ id: 1, revoked_at: t0 + 2 * HOUR }, { id: 2, revoked_at: null }]);
    for (const id of [1, 999, 'abc', '1.5', '-2']) {
      const missing = await revoke(operator, id);
      assert.equal(missing.status, 404, `revoke ${id}`);
      assert.deepEqual(await missing.json(), { success: false, error: 'No unused Invite has that id' });
    }
    assert.deepEqual(rows('SELECT id, revoked_at FROM invites ORDER BY id'), [{ id: 1, revoked_at: t0 + 2 * HOUR }, { id: 2, revoked_at: null }], 'a second revoke keeps the first time');

    // An Invite expires 7 days after it was made: listed until then, and gone from the list after.
    setSystemTime(t0 + HOUR + 7 * DAY - 1);
    assert.deepEqual(await list(operator), [second.invite]);
    setSystemTime(t0 + HOUR + 7 * DAY);
    assert.deepEqual(await list(operator), []);
    assert.equal((await revoke(operator, 2)).status, 404, 'an expired Invite is not on the list to revoke');
  },

  /** A new Discord account signs in through a valid Invite and becomes a server owner; the Invite records who and when. */
  async redeem() {
    const t0 = Date.UTC(2026, 10, 2, 12);
    setSystemTime(t0);
    const operator = await signedIn('operator-code');
    const { link } = await make(operator);
    const code = codeOf(link);
    setSystemTime(t0 + HOUR);
    const through = await signInAs('newcomer-code', link);
    // The link carries the code into a cookie for Discord's redirect back, and never to Discord.
    assert.equal(through.invite, `${INVITE_COOKIE}=${code}; Path=/api/auth/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    assert.equal(through.redirect, '/');
    const shell = await session(request('/api/auth/session', { token: through.token }));
    assert.deepEqual((await shell.json()).user, { name: 'New Comer', avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(NEWCOMER.id) >> BigInt(22)) % BigInt(6))}.png`, operator: false });

    // The Invite is spent: used by the new server owner, at that time, and off the list.
    assert.deepEqual(rows('SELECT id, discord_id FROM users ORDER BY id'), [{ id: 1, discord_id: OPERATOR.id }, { id: 2, discord_id: NEWCOMER.id }]);
    assert.deepEqual(rows('SELECT used_by, used_at, revoked_at FROM invites'), [{ used_by: 2, used_at: t0 + HOUR, revoked_at: null }]);
    assert.deepEqual(await list(operator), []);

    // From then on they sign in without one, and the spent link lets no one else in.
    assert.equal((await signInAs('newcomer-code')).redirect, '/');
    await refusedInviteOnly('second-code', link);
    assert.equal(rows('SELECT id FROM users').length, 2);
    const bytes = storedBytes();
    for (const value of [SECOND.id, SECOND.username]) assert(!bytes.includes(value), 'nothing about a refused account is stored');

    // Cancelling on Discord keeps the Invite for the next try, which may start from the plain sign-in button.
    const next = await make(operator);
    const start = await startSignIn(request(pathOf(next.link), { origin: null }));
    const invite = `${INVITE_COOKIE}=${valueOf(cookieNamed(start, INVITE_COOKIE))}`;
    const cancelled = await callback(request(`/api/auth/discord/callback?error=access_denied&state=${stateOf(start)}`, { origin: null, cookie: `${SIGN_IN_STATE_COOKIE}=${stateOf(start)}; ${invite}` }));
    assert.equal(cancelled.headers.get('Location'), '/?sign-in=cancelled');
    assert.equal(cookieNamed(cancelled, INVITE_COOKIE), undefined, 'a cancel leaves the Invite cookie');
    const retry = await startSignIn(request('/api/auth/discord', { origin: null }));
    assert.equal(cookieNamed(retry, INVITE_COOKIE), undefined, 'the plain button leaves the Invite cookie as it is');
    const back = await callback(request(`/api/auth/discord/callback?code=second-code&state=${stateOf(retry)}`, { origin: null, cookie: `${SIGN_IN_STATE_COOKIE}=${stateOf(retry)}; ${invite}` }));
    assert.equal(back.headers.get('Location'), '/');
    assert.equal(cookieNamed(back, INVITE_COOKIE), usedInviteCookie);
    secrets.add(valueOf(cookieNamed(back, SESSION_COOKIE))!);
    assert.deepEqual(await list(operator), []);
  },

  /** A server owner or operator who opens an Invite is just signed in, and the Invite stays unused; removed access is refused even with one. */
  async 'existing-owner'() {
    const operator = await signedIn('operator-code');
    await signedIn('newcomer-code', (await make(operator)).link);
    const { invite, link } = await make(operator);

    assert.equal((await signInAs('newcomer-code', link)).redirect, '/');
    assert.equal((await signInAs('operator-code', link)).redirect, '/');
    assert.deepEqual(await list(operator), [invite]);
    assert.deepEqual(rows('SELECT used_by, used_at FROM invites WHERE id = ?', invite.id), [{ used_by: null, used_at: null }]);

    // Remove access is #37's page; the record is changed directly here.
    platformStore().run('UPDATE users SET access_removed_at = ? WHERE discord_id = ?', Date.now(), NEWCOMER.id);
    const removed = await signInAs('newcomer-code', link);
    assert.equal(removed.redirect, '/?sign-in=access-removed');
    assert.equal(removed.token, undefined);
    assert.deepEqual(await list(operator), [invite]);

    // The Invite still lets a newcomer in.
    assert.equal((await signInAs('second-code', link)).redirect, '/');
    assert.deepEqual(await list(operator), []);
  },

  /** An expired, revoked, used, unknown or malformed Invite is refused as invite-only, and nothing is stored. */
  async refused() {
    const t0 = Date.UTC(2026, 10, 2, 12);
    setSystemTime(t0);
    const operator = await signedIn('operator-code');
    const [expiring, revoked, used, lastMoment] = [await make(operator), await make(operator), await make(operator), await make(operator)];
    assert.equal((await revoke(operator, revoked.invite.id)).status, 200);
    await signedIn('newcomer-code', used.link);

    await refusedInviteOnly('second-code', revoked.link);
    await refusedInviteOnly('second-code', used.link);
    const unknown = `${ORIGIN}/api/auth/discord?invite=${randomBytes(32).toString('base64url')}`;
    secrets.add(unknown).add(codeOf(unknown));
    await refusedInviteOnly('second-code', unknown);
    const malformed = await refusedInviteOnly('second-code', `${ORIGIN}/api/auth/discord?invite=not-an-invite-code`);
    assert.equal(malformed.invite, undefined, 'a malformed code never reaches a cookie');

    // 7 days after it was made, an Invite has expired.
    setSystemTime(t0 + 7 * DAY - 1);
    assert.equal((await signInAs('third-code', lastMoment.link)).redirect, '/', 'good until the last moment');
    setSystemTime(t0 + 7 * DAY);
    await refusedInviteOnly('second-code', expiring.link);

    assert.deepEqual(rows('SELECT discord_id FROM users ORDER BY id'), [{ discord_id: OPERATOR.id }, { discord_id: NEWCOMER.id }, { discord_id: THIRD.id }]);
    assert.deepEqual(rows('SELECT id, used_by FROM invites ORDER BY id'), [{ id: 1, used_by: null }, { id: 2, used_by: null }, { id: 3, used_by: 2 }, { id: 4, used_by: 3 }]);
    const bytes = storedBytes();
    for (const value of [SECOND.id, SECOND.username]) assert(!bytes.includes(value), 'nothing about a refused account is stored');
  },

  /** The startup hook schedules the sweep: a minute after start, then daily. Time moves with fake timers. */
  async sweep() {
    const t0 = Date.UTC(2026, 10, 2, 12);
    jest.useFakeTimers({ now: t0 });
    const { registerServerStartup } = await import('../../src/lib/server-startup');
    await registerServerStartup({ ...process.env, NEXT_RUNTIME: 'nodejs' });
    const sessionIds = () => rows<{ id: string }>('SELECT id FROM sessions').map(row => row.id).sort();
    const inviteIds = () => rows<{ id: number }>('SELECT id FROM invites ORDER BY id').map(row => row.id);

    const operator = await signedIn('operator-code');
    const idle = await signedIn('operator-code');
    const used = await make(operator);
    const newcomer = await signedIn('newcomer-code', used.link);
    await make(operator);
    const revoked = await make(operator);
    const all = [operator, idle, newcomer].map(sha256).sort();
    // The operator uses their session daily; the other two are never used again and expire 30 days after t0.
    const days = async (count: number) => {
      for (let day = 0; day < count; day++) {
        jest.advanceTimersByTime(DAY);
        assert.equal(await sessionStatus(operator), 200);
      }
    };

    jest.advanceTimersByTime(MINUTE);
    assert.deepEqual([sessionIds(), inviteIds()], [all, [1, 2, 3]], 'the first sweep finds nothing old');
    await days(1);
    assert.equal((await revoke(operator, revoked.invite.id)).status, 200);
    await days(28);
    assert.deepEqual([sessionIds(), inviteIds()], [all, [1, 2, 3]], 'day 29: nothing is old enough yet');
    await days(1);
    assert.deepEqual([sessionIds(), inviteIds()], [[sha256(operator)], [1, 2, 3]], 'day 30: the unused sessions expired and are gone');
    await days(1);
    assert.deepEqual(inviteIds(), [1, 2], 'day 31: 30 days after the revoke, its row is gone');
    await days(5);
    assert.deepEqual(inviteIds(), [1, 2], 'day 36: the unused Invite expired on day 7, so it stays a day more');
    await days(1);
    assert.deepEqual(inviteIds(), [1], 'day 37: 30 days after it expired, its row is gone; the used one stays');
    assert.deepEqual(rows('SELECT used_by FROM invites'), [{ used_by: 2 }]);
    assert.equal(rows('SELECT id FROM users').length, 2, 'the sweep deletes no server owner');

    // Starting the sweep again in the same process (a hot reload with changed settings reruns it) keeps one
    // schedule, not two: the test counts one sweep a minute later and one a day after that, then none once stopped.
    const { startDailySweep, stopDailySweep } = await import('../../src/lib/platform/retention');
    startDailySweep();
    jest.advanceTimersByTime(MINUTE + DAY);
    stopDailySweep();
    jest.advanceTimersByTime(2 * DAY);
    jest.useRealTimers();
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets] } }));
