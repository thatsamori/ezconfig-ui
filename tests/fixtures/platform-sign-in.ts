/**
 * Sign-in with Discord, sessions and the Origin check, through the route
 * handlers. One scenario per run (argv[2]), each in its own process with the
 * env set by tests/platform-sign-in.test.ts. Discord is never called: the OAuth
 * exchange module is replaced, and the `exchange` scenario replaces fetch to
 * check the module itself.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the secrets it
 * handled (session tokens, Discord ids and names, OAuth codes) so the test can
 * check that no log line holds any of them.
 */
import { mock, setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { Glob } from 'bun';
import type { DiscordUser } from '../../src/lib/platform/discord';

const OPERATOR = { id: '80351110224678912', username: 'opuser', global_name: 'Op Erator', avatar: 'a_0123456789abcdef0123456789abcdef' };
const STRANGER = { id: '41771983423143937', username: 'stranger-name', global_name: null, avatar: null };
const OWNER = { id: '53908232506183680', username: 'owner-name', global_name: 'Owner Display', avatar: null };
const ACCOUNTS: Record<string, DiscordUser> = {
  'operator-code': OPERATOR,
  'operator-renamed-code': { ...OPERATOR, global_name: 'Op Renamed', avatar: '0123456789abcdef0123456789abcdef' },
  'stranger-code': STRANGER,
  'owner-code': OWNER,
  'no-id-code': { id: null, username: 'nobody' },
};

const scenario = process.argv[2];
const secrets = new Set<string>([OPERATOR, STRANGER, OWNER].flatMap(account => [account.id, account.username, account.global_name ?? '']).filter(Boolean).concat(Object.keys(ACCOUNTS), 'Op Renamed'));
let handover: string | undefined;
const exchanged: string[] = [];
if (scenario !== 'exchange') mock.module('../../src/lib/platform/discord', () => ({
  exchangeDiscordCode: async (code: string) => {
    exchanged.push(code);
    const account = ACCOUNTS[code];
    if (!account) throw new Error('Discord refused the code');
    return account;
  },
}));

const { env } = await import('../../src/lib/env');
const { SESSION_COOKIE, SIGN_IN_STATE_COOKIE } = await import('../../src/lib/platform/auth');
const { platformStore } = await import('../../src/lib/platform/storage');
const { SESSION_LIFETIME_MS } = await import('../../src/lib/platform/sessions');
const { GET: startSignIn } = await import('../../src/app/api/auth/discord/route');
const { GET: callback } = await import('../../src/app/api/auth/discord/callback/route');
const { GET: session } = await import('../../src/app/api/auth/session/route');
const { POST: signOut } = await import('../../src/app/api/auth/sign-out/route');
const { POST: signOutEverywhere } = await import('../../src/app/api/auth/sign-out-everywhere/route');
const ORIGIN = new URL(env.publicUrl).origin;
const DAY = 86_400_000, HOUR = 3_600_000;

type Options = { token?: string; origin?: string | null; method?: string; body?: unknown; cookie?: string };
function request(path: string, { token, origin = ORIGIN, method = 'GET', body, cookie }: Options = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.append('Cookie', `${SESSION_COOKIE}=${token}`);
  if (cookie) headers.append('Cookie', cookie);
  if (origin) headers.set('Origin', origin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(new URL(path, env.publicUrl), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const setCookies = (response: Response) => response.headers.getSetCookie();
const cookieNamed = (response: Response, name: string) => setCookies(response).find(cookie => cookie.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined) => cookie?.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
const rows = <Row>(sql: string, ...params: (string | number)[]) => platformStore().all<Row>(sql, ...params);

/** A browser going through the sign-in button and Discord's redirect back, as `code`'s account. */
async function signInAs(code: string) {
  const start = await startSignIn(request('/api/auth/discord', { origin: null }));
  assert.equal(start.status, 303);
  const location = new URL(start.headers.get('Location')!);
  const stateCookie = cookieNamed(start, SIGN_IN_STATE_COOKIE)!;
  const state = location.searchParams.get('state')!;
  assert.equal(valueOf(stateCookie), state, 'the state in the URL is the one in the cookie');
  const response = await callback(request(`/api/auth/discord/callback?code=${code}&state=${state}`, { origin: null, cookie: `${SIGN_IN_STATE_COOKIE}=${state}` }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(cookieNamed(response, SIGN_IN_STATE_COOKIE), `${SIGN_IN_STATE_COOKIE}=; Path=/api/auth/discord; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, 'the state is used once');
  const token = valueOf(cookieNamed(response, SESSION_COOKIE));
  if (token) secrets.add(token);
  return { start, location, stateCookie, response, redirect: response.headers.get('Location'), token };
}
const signedIn = async (code: string) => {
  const { token, redirect } = await signInAs(code);
  assert.equal(redirect, '/');
  return token!;
};
const sessionStatus = async (token: string) => (await session(request('/api/auth/session', { token }))).status;

/** The bytes of the database and its write-ahead log, where a refused sign-in must leave nothing. */
function storedBytes() {
  return [env.databasePath, `${env.databasePath}-wal`].filter(existsSync).map(path => readFileSync(path).toString('latin1')).join('');
}

const scenarios: Record<string, () => Promise<void>> = {
  async operator() {
    const first = await signInAs('operator-code');
    // Only `identify`, with the instance's client id and redirect URL.
    assert.equal(first.location.origin + first.location.pathname, 'https://discord.com/oauth2/authorize');
    assert.deepEqual(Object.fromEntries(first.location.searchParams), {
      response_type: 'code', client_id: env.discordClientId, scope: 'identify',
      redirect_uri: env.discordRedirectUrl, state: first.location.searchParams.get('state'),
    });
    assert.equal(env.discordRedirectUrl, `${ORIGIN}/api/auth/discord/callback`);
    assert.match(first.stateCookie, /^ezconfig_sign_in_state=[\w-]{43}; Path=\/api\/auth\/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
    assert.equal(first.redirect, '/');
    assert.deepEqual(exchanged, ['operator-code']);
    assert.match(cookieNamed(first.response, SESSION_COOKIE)!, /^ezconfig_session=[\w-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);

    // The record: Discord id, a copied name and avatar, the first sign-in time and no access removed time. No tokens.
    const users = rows<Record<string, unknown>>('SELECT * FROM users');
    assert.equal(users.length, 1);
    assert.deepEqual({ ...users[0], first_signed_in_at: typeof users[0].first_signed_in_at }, {
      id: users[0].id, discord_id: OPERATOR.id, username: 'Op Erator', avatar: OPERATOR.avatar, first_signed_in_at: 'number', access_removed_at: null,
    });
    const sessions = rows<Record<string, unknown>>('SELECT * FROM sessions');
    assert.deepEqual(Object.keys(sessions[0]).sort(), ['created_at', 'expires_at', 'id', 'last_seen_at', 'user_id']);
    assert.equal(sessions[0].id, createHash('sha256').update(first.token!).digest('hex'), 'only the hash of the token is stored');
    assert(!storedBytes().includes(first.token!), 'the token itself is stored nowhere');

    const shell = await session(request('/api/auth/session', { token: first.token }));
    assert.equal(shell.status, 200);
    assert.deepEqual(await shell.json(), { user: { name: 'Op Erator', avatarUrl: `https://cdn.discordapp.com/avatars/${OPERATOR.id}/${OPERATOR.avatar}.png?size=64`, operator: true } });
    assert.match(cookieNamed(shell, SESSION_COOKIE)!, /Max-Age=2592000/, 'loading the shell renews the cookie');

    // Signing in again copies the new name and avatar onto the same record.
    const firstSignedInAt = users[0].first_signed_in_at;
    await Bun.sleep(2);
    const again = await signedIn('operator-renamed-code');
    assert.notEqual(again, first.token);
    assert.deepEqual(rows('SELECT id, username, avatar, first_signed_in_at FROM users'), [{ id: users[0].id, username: 'Op Renamed', avatar: '0123456789abcdef0123456789abcdef', first_signed_in_at: firstSignedInAt }]);
    assert.equal(rows('SELECT id FROM sessions').length, 2, 'each browser has its own session');
  },

  async 'invite-only'() {
    const refused = await signInAs('stranger-code');
    assert.equal(refused.redirect, '/?sign-in=invite-only');
    assert.equal(refused.token, undefined, 'no session cookie');
    assert.deepEqual([rows('SELECT id FROM users').length, rows('SELECT id FROM sessions').length], [0, 0]);
    const bytes = storedBytes();
    for (const value of [STRANGER.id, STRANGER.username]) assert(!bytes.includes(value), 'nothing about the account is stored');
  },

  async 'access-removed'() {
    // A server owner (as an Invite will create one) whose access the operator removed.
    platformStore().run('INSERT INTO users (discord_id, username, avatar, first_signed_in_at, access_removed_at) VALUES (?, ?, NULL, ?, ?)', OWNER.id, 'Owner Display', Date.now(), Date.now());
    const refused = await signInAs('owner-code');
    assert.equal(refused.redirect, '/?sign-in=access-removed');
    assert.equal(refused.token, undefined);
    assert.equal(rows('SELECT id FROM sessions').length, 0);
    // Restored access lets them back in, with Discord's default avatar.
    platformStore().run('UPDATE users SET access_removed_at = NULL');
    const token = await signedIn('owner-code');
    const user = (await (await session(request('/api/auth/session', { token }))).json()).user;
    assert.deepEqual(user, { name: 'Owner Display', avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(OWNER.id) >> BigInt(22)) % BigInt(6))}.png`, operator: false });
  },

  async expiry() {
    const t0 = Date.UTC(2026, 10, 2, 12);
    const lastSeen = () => rows<{ last_seen_at: number; expires_at: number }>('SELECT last_seen_at, expires_at FROM sessions')[0];
    setSystemTime(t0);
    const token = await signedIn('operator-code');
    assert.deepEqual(lastSeen(), { last_seen_at: t0, expires_at: t0 + SESSION_LIFETIME_MS });
    // Within the hour, a request only reads.
    setSystemTime(t0 + 30 * 60_000);
    assert.equal(await sessionStatus(token), 200);
    assert.deepEqual(lastSeen(), { last_seen_at: t0, expires_at: t0 + 30 * DAY });
    // An hour on, last seen is written and the 30 days start again from it.
    setSystemTime(t0 + 2 * HOUR);
    assert.equal(await sessionStatus(token), 200);
    assert.deepEqual(lastSeen(), { last_seen_at: t0 + 2 * HOUR, expires_at: t0 + 2 * HOUR + 30 * DAY });
    // Past the first sign-in's 30 days, still signed in: it was used since.
    setSystemTime(t0 + 30 * DAY + HOUR);
    assert.equal(await sessionStatus(token), 200);
    // 30 days without use: expired, and the shell's check clears the cookie.
    setSystemTime(t0 + 60 * DAY + HOUR);
    const expired = await session(request('/api/auth/session', { token }));
    assert.equal(expired.status, 401);
    assert.equal(cookieNamed(expired, SESSION_COOKIE), `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    const { GET: gameServers } = await import('../../src/app/api/game-servers/route');
    assert.equal((await gameServers(request('/api/game-servers', { token }))).status, 401, 'an expired session reaches no route');
    // The next sign-in clears expired sessions out.
    await signedIn('operator-code');
    assert.equal(rows('SELECT id FROM sessions').length, 1);
  },

  async 'sign-out'() {
    const [laptop, phone] = [await signedIn('operator-code'), await signedIn('operator-code')];
    const out = await signOut(request('/api/auth/sign-out', { method: 'POST', token: laptop }));
    assert.equal(out.status, 200);
    assert.equal(cookieNamed(out, SESSION_COOKIE), `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    assert.deepEqual([await sessionStatus(laptop), await sessionStatus(phone)], [401, 200], 'sign out ends this session only');
    assert.equal((await signOut(request('/api/auth/sign-out', { method: 'POST', token: laptop }))).status, 401);

    const tablet = await signedIn('operator-code');
    const everywhere = await signOutEverywhere(request('/api/auth/sign-out-everywhere', { method: 'POST', token: phone }));
    assert.equal(everywhere.status, 200);
    assert.match(cookieNamed(everywhere, SESSION_COOKIE)!, /Max-Age=0/);
    assert.deepEqual([await sessionStatus(phone), await sessionStatus(tablet)], [401, 401], 'sign out everywhere ends every session');
    assert.equal(rows('SELECT id FROM sessions').length, 0);
  },

  async origin() {
    const token = await signedIn('operator-code');
    const { POST: register } = await import('../../src/app/api/game-servers/route');
    const { PUT: save, GET: read } = await import('../../src/app/api/game-servers/[id]/draft/route');
    const registered = await register(request('/api/game-servers', { method: 'POST', token, body: { name: 'Origin check' } }));
    assert.equal(registered.status, 201);
    const draft = `/api/game-servers/${(await registered.json()).data.gameServer.id}/draft`;
    const at = { params: Promise.resolve({ id: draft.split('/')[3] }) };
    const edit = (origin: string | null) => save(request(draft, { method: 'PUT', token, origin, body: { revision: 0, document: { Character: { MaxWalkSpeed: 450 } } } }), at);
    const saved = async () => (await (await read(request(draft, { token, origin: null }), at)).json()).data.values.character;
    for (const origin of [null, 'https://elsewhere.example', 'http://localhost:3000', `${ORIGIN}.example`]) {
      const refused = await edit(origin);
      assert.equal(refused.status, 403, `Origin ${origin} is refused`);
      assert.deepEqual(await refused.json(), { success: false, error: 'Refused: this request did not come from the platform' });
    }
    assert.deepEqual(await saved(), {}, 'a refused request changes nothing; a GET needs no Origin');
    assert.equal((await edit(ORIGIN)).status, 200);
    assert.deepEqual(await saved(), { Movement: { MaxWalkSpeed: 450 } });

    for (const origin of [null, 'https://elsewhere.example']) {
      assert.equal((await signOut(request('/api/auth/sign-out', { method: 'POST', token, origin }))).status, 403);
      assert.equal((await signOutEverywhere(request('/api/auth/sign-out-everywhere', { method: 'POST', token, origin }))).status, 403);
    }
    assert.equal(await sessionStatus(token), 200, 'a refused sign-out leaves the session');
  },

  /** Every self-hosted route handler answers 401 without a session, and 403 to a cross-site change. */
  async routes() {
    const token = await signedIn('operator-code');
    const files = [...new Glob('src/app/api/**/route.ts').scanSync('.')].map(file => file.replaceAll('\\', '/')).filter(file => !file.startsWith('src/app/api/auth/')).sort();
    assert(files.length >= 15, `found ${files.length} route files`);
    const context = { params: Promise.resolve({ path: ['Character', 'Movement'], schema: 'Character', name: 'fixture' }) };
    let handlers = 0;
    for (const file of files) {
      const route = await import(`../../${file}`) as Record<string, unknown>;
      const path = '/' + file.slice('src/app/'.length, -'/route.ts'.length);
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const handler = route[method];
        if (typeof handler !== 'function') continue;
        handlers++;
        const call = (options: Options) => (handler as (request: Request, context: unknown) => Promise<Response>)(request(path, { method, ...options }), context);
        assert.equal((await call({})).status, 401, `${method} ${path} without a session`);
        assert.equal((await call({ token: 'not-a-session' })).status, 401, `${method} ${path} with a made-up cookie`);
        if (method !== 'GET' && method !== 'HEAD') assert.equal((await call({ token, origin: 'https://elsewhere.example' })).status, 403, `${method} ${path} from another site`);
      }
    }
    assert(handlers >= 20, `checked ${handlers} handlers`);
  },

  async 'state'() {
    const start = await startSignIn(request('/api/auth/discord', { origin: null }));
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    const back = async (query: string, cookie?: string) => (await callback(request(`/api/auth/discord/callback?${query}`, { origin: null, cookie }))).headers.get('Location');
    // Discord's redirect without this browser's state cookie, or with another one, is refused before the code is used.
    assert.equal(await back(`code=operator-code&state=${state}`), '/?sign-in=failed');
    assert.equal(await back(`code=operator-code&state=${state}`, `${SIGN_IN_STATE_COOKIE}=someone-elses-state`), '/?sign-in=failed');
    assert.equal(await back('code=operator-code', `${SIGN_IN_STATE_COOKIE}=${state}`), '/?sign-in=failed');
    assert.deepEqual(exchanged, []);
    // Cancelled on Discord: no code.
    assert.equal(await back(`error=access_denied&state=${state}`, `${SIGN_IN_STATE_COOKIE}=${state}`), '/?sign-in=cancelled');
    // A code Discord refuses, or an account without an id.
    assert.equal((await signInAs('expired-code')).redirect, '/?sign-in=failed');
    assert.equal((await signInAs('no-id-code')).redirect, '/?sign-in=failed');
    secrets.add('expired-code');
    assert.deepEqual(exchanged, ['expired-code', 'no-id-code']);
    assert.equal(rows('SELECT id FROM users').length, 0);
  },

  /** The instance has no Discord application or database configured (env from the test). */
  async 'not-configured'() {
    const start = await startSignIn(request('/api/auth/discord', { origin: null }));
    assert.equal(start.status, 303);
    assert.equal(start.headers.get('Location'), '/?sign-in=failed');
    assert.equal(cookieNamed(start, SIGN_IN_STATE_COOKIE), undefined);
  },

  /** First half of a restart: sign in and hand the token over (the test reads it from the fixture line). */
  async 'before-restart'() {
    handover = await signedIn('operator-code');
  },

  /** Second half, in a new process on the same database. */
  async 'after-restart'() {
    const token = process.env.EZ_FIXTURE_SESSION_TOKEN!;
    secrets.add(token);
    assert.equal(await sessionStatus(token), 200, 'the session survives a restart');
  },

  /** The OAuth exchange module itself, with fetch replaced: the code goes to Discord's token endpoint, the token only to /users/@me, and only the account comes back. */
  async exchange() {
    const { exchangeDiscordCode } = await import('../../src/lib/platform/discord');
    const calls: { url: string; init: RequestInit }[] = [];
    const accessToken = 'discord-access-token-never-kept';
    secrets.add(accessToken);
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/oauth2/token')) return Response.json({ access_token: accessToken, refresh_token: 'discord-refresh-token', token_type: 'Bearer', scope: 'identify' });
      return Response.json(OPERATOR);
    }) as typeof fetch;
    const account = await exchangeDiscordCode('operator-code');
    assert.deepEqual(account, OPERATOR);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://discord.com/api/v10/oauth2/token');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(calls[0].init.body))), {
      grant_type: 'authorization_code', code: 'operator-code', redirect_uri: env.discordRedirectUrl, client_id: env.discordClientId, client_secret: env.discordClientSecret,
    });
    assert.equal(calls[1].url, 'https://discord.com/api/v10/users/@me');
    assert.equal(new Headers(calls[1].init.headers).get('Authorization'), `Bearer ${accessToken}`);
    assert(!JSON.stringify(account).includes(accessToken));

    globalThis.fetch = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(exchangeDiscordCode('expired-code'), (error: Error) => !error.message.includes('expired-code') && /400/.test(error.message));
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets], token: handover } }));
