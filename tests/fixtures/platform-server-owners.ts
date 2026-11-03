/**
 * The platform operator manages server owners, through the route handlers
 * (online-platform#37): the list, Remove access and Restore access, Delete
 * with its cascade, refusals against a platform operator, and no reads of
 * another owner's game servers, Drafts, Live configurations or Rulesets. One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-server-owners.test.ts. Discord's OAuth exchange is replaced.
 * Polls are held for a short real time (setPollHoldMs); the clock is moved
 * with setSystemTime.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the secrets it
 * handled (session tokens, Invite links, Game server keys, Discord ids and
 * names, game server and Ruleset names) so the test can check that no log
 * line holds any of them.
 */
import { mock, setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import type { DiscordUser } from '../../src/lib/platform/discord';
import type { ServerOwnerListing } from '../../src/lib/platform/server-owners';

const OPERATOR = { id: '80351110224678912', username: 'opuser', global_name: 'Olive Operator', avatar: null };
const SECOND_OPERATOR = { id: '11111111111111111', username: 'opuser-two', global_name: 'Otto Operator', avatar: null };
const ANN = { id: '41771983423143937', username: 'ann-name', global_name: 'Ann Owner', avatar: '0123456789abcdef0123456789abcdef' };
const BOB = { id: '53908232506183680', username: 'bob-name', global_name: 'Bob Owner', avatar: null };
const ACCOUNTS: Record<string, DiscordUser> = { 'operator-code': OPERATOR, 'second-operator-code': SECOND_OPERATOR, 'ann-code': ANN, 'bob-code': BOB };

const scenario = process.argv[2];
const secrets = new Set<string>([OPERATOR, SECOND_OPERATOR, ANN, BOB].flatMap(account => [account.id, account.username, account.global_name]).concat(Object.keys(ACCOUNTS)));
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
const { pollActivity, setPollHoldMs } = await import('../../src/lib/platform/polls');
const { GET: startSignIn } = await import('../../src/app/api/auth/discord/route');
const { GET: callback } = await import('../../src/app/api/auth/discord/callback/route');
const { POST: signOut } = await import('../../src/app/api/auth/sign-out/route');
const ownersRoute = await import('../../src/app/api/operator/server-owners/route');
const ownerRoute = await import('../../src/app/api/operator/server-owners/[id]/route');
const removeRoute = await import('../../src/app/api/operator/server-owners/[id]/remove-access/route');
const restoreRoute = await import('../../src/app/api/operator/server-owners/[id]/restore-access/route');
const invitesRoute = await import('../../src/app/api/operator/invites/route');
const supportedBuildRoute = await import('../../src/app/api/operator/supported-build/route');
const statusRoute = await import('../../src/app/api/operator/status/route');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const regenerateRoute = await import('../../src/app/api/game-servers/[id]/regenerate-key/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const loadRoute = await import('../../src/app/api/game-servers/[id]/draft/load/route');
const saveVersionRoute = await import('../../src/app/api/game-servers/[id]/draft/save-version/route');
const applyRoute = await import('../../src/app/api/game-servers/[id]/apply/route');
const rulesetsRoute = await import('../../src/app/api/rulesets/route');
const rulesetRoute = await import('../../src/app/api/rulesets/[id]/route');
const notesRoute = await import('../../src/app/api/notes/route');
const pollRoute = await import('../../src/app/game-server/poll/route');

const ORIGIN = new URL(env.publicUrl).origin;
const SUPPORTED = '20261102-153000', NEXT_BUILD = '20261110-090000';
const MINUTE = 60_000, HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 3, 12);
const at = (time: number) => setSystemTime(new Date(time));
at(T0);
setPollHoldMs(50);

type Options = { token?: string; origin?: string | null; method?: string; cookie?: string; body?: unknown };
function request(path: string, { token, origin = ORIGIN, method = 'GET', cookie, body }: Options = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.append('Cookie', `${SESSION_COOKIE}=${token}`);
  if (cookie) headers.append('Cookie', cookie);
  if (origin) headers.set('Origin', origin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(new URL(path, env.publicUrl), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
type Body = { success?: boolean; error?: string; data?: unknown; serverOwners?: ServerOwnerListing[]; serverOwner?: ServerOwnerListing };
const answer = async (response: Response) => {
  const text = await response.text();
  return { status: response.status, cache: response.headers.get('Cache-Control'), text, body: JSON.parse(text) as Body };
};
const count = (sql: string, ...values: (string | number)[]) => platformStore().get<{ count: number }>(sql, ...values)!.count;

// Signing in, as a browser does it.
const cookieNamed = (response: Response, name: string) => response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined) => cookie?.slice(cookie.indexOf('=') + 1, cookie.indexOf(';')) || undefined;
const pathOf = (link: string) => new URL(link).pathname + new URL(link).search;
/** A browser pressing the sign-in button, or opening an Invite link, and coming back from Discord as `code`'s account. */
async function signInAs(code: string, link?: string) {
  const start = await startSignIn(request(link ? pathOf(link) : '/api/auth/discord', { origin: null }));
  assert.equal(start.status, 303);
  const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
  const invite = valueOf(cookieNamed(start, INVITE_COOKIE));
  const cookie = [`${SIGN_IN_STATE_COOKIE}=${state}`, ...(invite ? [`${INVITE_COOKIE}=${invite}`] : [])].join('; ');
  const response = await callback(request(`/api/auth/discord/callback?code=${code}&state=${state}`, { origin: null, cookie }));
  assert.equal(response.status, 303);
  const token = valueOf(cookieNamed(response, SESSION_COOKIE));
  if (token) secrets.add(token);
  return { redirect: response.headers.get('Location'), token };
}
async function signedIn(code: string, link?: string) {
  const { redirect, token } = await signInAs(code, link);
  assert.equal(redirect, '/');
  return token!;
}
async function refused(code: string, link: string | undefined, refusal: string) {
  const { redirect, token } = await signInAs(code, link);
  assert.equal(redirect, `/?sign-in=${refusal}`);
  assert.equal(token, undefined, 'no session cookie');
}
const signedInStatus = async (token: string) => (await gameServersRoute.GET(request('/api/game-servers', { token }))).status;
async function inviteLink(operator: string) {
  const { status, body } = await answer(await invitesRoute.POST(request('/api/operator/invites', { token: operator, method: 'POST' })));
  assert.equal(status, 201);
  const { link } = body as { link: string };
  secrets.add(link);
  return link;
}

// The operator's Server owners routes.
async function list(token: string) {
  const result = await answer(await ownersRoute.GET(request('/api/operator/server-owners', { token })));
  assert.deepEqual([result.status, result.cache], [200, 'no-store'], result.body.error);
  return result;
}
const owners = async (token: string) => (await list(token)).body.serverOwners!;
const removeAccess = async (token: string, id: number | string, origin?: string) =>
  answer(await removeRoute.POST(request(`/api/operator/server-owners/${id}/remove-access`, { token, method: 'POST', origin }), params(id)));
const restoreAccess = async (token: string, id: number | string) =>
  answer(await restoreRoute.POST(request(`/api/operator/server-owners/${id}/restore-access`, { token, method: 'POST' }), params(id)));
const deleteOwner = async (token: string, id: number | string, body?: unknown) =>
  answer(await ownerRoute.DELETE(request(`/api/operator/server-owners/${id}`, { token, method: 'DELETE', body }), params(id)));
const idOf = (discordId: string) => platformStore().get<{ id: number }>('SELECT id FROM users WHERE discord_id = ?', discordId)!.id;
const step = (name: string) => console.log(JSON.stringify({ step: name }));

// A server owner's own pages.
async function registered(token: string, name: string) {
  secrets.add(name);
  const { status, body } = await answer(await gameServersRoute.POST(request('/api/game-servers', { token, method: 'POST', body: { name } })));
  assert.equal(status, 201, body.error);
  const { gameServer, key } = body.data as { gameServer: { id: number }; key: string };
  secrets.add(key);
  return { id: gameServer.id, key };
}
async function revisionOf(token: string, id: number) {
  return ((await answer(await draftRoute.GET(request(`/api/game-servers/${id}/draft`, { token }), params(id)))).body.data as { revision: number }).revision;
}
async function save(token: string, id: number, document: unknown) {
  const revision = await revisionOf(token, id);
  const { status } = await answer(await draftRoute.PUT(request(`/api/game-servers/${id}/draft`, { token, method: 'PUT', body: { revision, document } }), params(id)));
  assert.equal(status, 200, 'the Draft saves');
}
async function saveVersion(token: string, id: number, name: string) {
  secrets.add(name);
  const revision = await revisionOf(token, id);
  const { status, body } = await answer(await saveVersionRoute.POST(request(`/api/game-servers/${id}/draft/save-version`, { token, method: 'POST', body: { revision, name } }), params(id)));
  assert.equal(status, 201, body.error);
  const { ruleset, version } = body.data as { ruleset: { id: number }; version: { id: number } };
  return { rulesetId: ruleset.id, versionId: version.id };
}
async function setSupportedBuild(operator: string, stamp: string) {
  const { status } = await answer(await supportedBuildRoute.PUT(request('/api/operator/supported-build', { token: operator, method: 'PUT', body: { stamp } })));
  assert.equal(status, 200);
}

// A game server polling, as the mod sends it.
type Delivery = { answer: string; liveConfigurationId?: string };
const report = (fields: Record<string, unknown> = {}) => ({ buildStamp: SUPPORTED, instanceId: 'instance-a', processed: null, ...fields });
const processed = (liveConfigurationId: string) => ({ liveConfigurationId, result: { success: true, acceptedValues: 1, changedValues: 1, unknownKeys: [], failure: null } });
async function poll(key: string, body: unknown, signal?: AbortSignal) {
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Delivery };
}
/** A poll that is held: resolves once it is, with its answer to come. */
async function held(key: string, id: number, body: unknown) {
  const answered = poll(key, body);
  for (let tries = 0; !pollActivity(id).held; tries++) {
    assert(tries < 500, 'the poll is held');
    await Bun.sleep(1);
  }
  return { answered };
}
/** What a poll that is held is answered, when its hold ends or something answers it. */
const heldAnswer = async (key: string, id: number, body: unknown) => (await (await held(key, id, body)).answered).body;
/** Apply, with a review built just now; the game server's held poll is woken with the new Live configuration. */
async function apply(token: string, id: number, key: string) {
  const { answered } = await held(key, id, report());
  const review = (await answer(await applyRoute.GET(request(`/api/game-servers/${id}/apply`, { token }), params(id)))).body.data as { revision: number; liveConfigurationId: string | null };
  const { status, body } = await answer(await applyRoute.POST(request(`/api/game-servers/${id}/apply`, { token, method: 'POST', body: { revision: review.revision, liveConfigurationId: review.liveConfigurationId } }), params(id)));
  assert.equal(status, 200, body.error);
  const { liveConfigurationId } = body.data as { liveConfigurationId: string };
  const woken = (await answered).body;
  assert.deepEqual([woken.answer, woken.liveConfigurationId], ['live-configuration', liveConfigurationId], 'the held poll is woken with it');
  return liveConfigurationId;
}

const DOCUMENT = { Character: { MaxWalkSpeed: 450 } };
/**
 * Ann's data: a game server with a Draft saved as a Ruleset version, applied
 * and Confirmed on the Supported build, and a Note.
 */
async function annsData(ann: string, operator: string) {
  await setSupportedBuild(operator, SUPPORTED);
  const server = await registered(ann, 'Ann Duel EU');
  await save(ann, server.id, DOCUMENT);
  const { rulesetId, versionId } = await saveVersion(ann, server.id, 'Ann Competitive');
  const liveConfigurationId = await apply(ann, server.id, server.key);
  assert.deepEqual(await heldAnswer(server.key, server.id, report({ processed: processed(liveConfigurationId) })), { answer: 'no-change' }, 'Confirmed, and nothing more to send');
  const note = await answer(await notesRoute.POST(request('/api/notes', { token: ann, method: 'POST', body: { database: 'Character', key: 'MaxWalkSpeed', body: '<p>Ann on walk speed</p>' } })));
  secrets.add('<p>Ann on walk speed</p>');
  assert.equal(note.status, 201);
  return { server, liveConfigurationId, rulesetId, versionId };
}
/** What is stored of one server owner's own. */
const holdings = (userId: number) => ({
  gameServers: count('SELECT COUNT(*) AS count FROM game_servers WHERE owner_id = ?', userId),
  drafts: count('SELECT COUNT(*) AS count FROM drafts JOIN game_servers ON game_servers.id = game_server_id WHERE owner_id = ?', userId),
  liveConfigurations: count('SELECT COUNT(*) AS count FROM live_configurations JOIN game_servers ON game_servers.id = game_server_id WHERE owner_id = ?', userId),
  rulesets: count('SELECT COUNT(*) AS count FROM rulesets WHERE owner_id = ?', userId),
  rulesetVersions: count('SELECT COUNT(*) AS count FROM ruleset_versions JOIN rulesets ON rulesets.id = ruleset_id WHERE owner_id = ?', userId),
  notes: count('SELECT COUNT(*) AS count FROM notes WHERE author_id = ?', userId),
  sessions: count('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?', userId),
  usedInvites: count('SELECT COUNT(*) AS count FROM invites WHERE used_by = ?', userId),
});

const scenarios: Record<string, () => Promise<void>> = {
  async list() {
    const operator = await signedIn('operator-code');
    at(T0 + MINUTE);
    const ann = await signedIn('ann-code', await inviteLink(operator));
    at(T0 + 2 * MINUTE);
    const bob = await signedIn('bob-code', await inviteLink(operator));
    await registered(ann, 'Ann Duel EU');
    await registered(ann, 'Ann Duel NA');
    // Ann comes back 3 hours later, which writes her session's last seen.
    at(T0 + 3 * HOUR);
    assert.equal(await signedInStatus(ann), 200);
    const { text, body } = await list(operator);
    const [operatorId, annId, bobId] = [idOf(OPERATOR.id), idOf(ANN.id), idOf(BOB.id)];
    assert.deepEqual(body, { serverOwners: [
      // The operator's own request at T0 + 3 h is their last seen.
      { id: operatorId, name: 'Olive Operator', avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(OPERATOR.id) >> BigInt(22)) % BigInt(6))}.png`, firstSignedInAt: T0, lastSeenAt: T0 + 3 * HOUR, gameServers: 0, accessRemovedAt: null, operator: true },
      { id: annId, name: 'Ann Owner', avatarUrl: `https://cdn.discordapp.com/avatars/${ANN.id}/${ANN.avatar}.png?size=64`, firstSignedInAt: T0 + MINUTE, lastSeenAt: T0 + 3 * HOUR, gameServers: 2, accessRemovedAt: null, operator: false },
      { id: bobId, name: 'Bob Owner', avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(BOB.id) >> BigInt(22)) % BigInt(6))}.png`, firstSignedInAt: T0 + 2 * MINUTE, lastSeenAt: T0 + 2 * MINUTE, gameServers: 0, accessRemovedAt: null, operator: false },
    ] });
    assert(!text.includes('Ann Duel'), 'game servers are counted, never named');

    // Last seen is the latest of their sessions; with none, null.
    at(T0 + 4 * HOUR);
    const annElsewhere = await signedIn('ann-code');
    assert.equal((await signOut(request('/api/auth/sign-out', { token: bob, method: 'POST' }))).status, 200);
    const later = await owners(operator);
    assert.deepEqual(later.map(owner => [owner.name, owner.lastSeenAt]), [['Olive Operator', T0 + 4 * HOUR], ['Ann Owner', T0 + 4 * HOUR], ['Bob Owner', null]]);

    // Only the platform operator: another server owner gets 403 from every route, logged.
    step('a server owner who is not the operator');
    for (const response of [
      await ownersRoute.GET(request('/api/operator/server-owners', { token: annElsewhere })),
      await removeRoute.POST(request(`/api/operator/server-owners/${bobId}/remove-access`, { token: ann, method: 'POST' }), params(bobId)),
      await restoreRoute.POST(request(`/api/operator/server-owners/${bobId}/restore-access`, { token: ann, method: 'POST' }), params(bobId)),
      await ownerRoute.DELETE(request(`/api/operator/server-owners/${bobId}`, { token: ann, method: 'DELETE', body: { confirm: 'Bob Owner' } }), params(bobId)),
    ]) assert.deepEqual([response.status, (await response.json()).error], [403, 'Only the platform operator can do this']);
    // Signed out, 401; a change from another site, 403.
    step('signed out, and from another site');
    assert.equal((await ownersRoute.GET(request('/api/operator/server-owners'))).status, 401);
    assert.equal((await removeAccess(bob, bobId)).status, 401, 'Bob signed out');
    assert.equal((await removeAccess(operator, bobId, 'https://elsewhere.test')).status, 403);
    assert.equal(count('SELECT COUNT(*) AS count FROM users WHERE access_removed_at IS NOT NULL'), 0, 'no refused request removed anyone\'s access');
  },

  async 'remove-access'() {
    const operator = await signedIn('operator-code');
    const link = await inviteLink(operator);
    const ann = await signedIn('ann-code', link), annElsewhere = await signedIn('ann-code');
    const annId = idOf(ANN.id);
    const { server, liveConfigurationId } = await annsData(ann, operator);
    const before = holdings(annId);
    assert.deepEqual(before, { gameServers: 1, drafts: 1, liveConfigurations: 1, rulesets: 1, rulesetVersions: 1, notes: 1, sessions: 2, usedInvites: 1 });

    // Remove access: the time is set and both of Ann's sessions end.
    at(T0 + HOUR);
    step('remove access');
    const removed = await removeAccess(operator, annId);
    assert.deepEqual([removed.status, removed.cache], [200, 'no-store']);
    assert.deepEqual(removed.body.serverOwner, { ...removed.body.serverOwner, id: annId, accessRemovedAt: T0 + HOUR, lastSeenAt: null, gameServers: 1, operator: false });
    assert.equal(await signedInStatus(ann), 401);
    assert.equal(await signedInStatus(annElsewhere), 401);
    // Removing it again keeps the first time, and is not logged.
    at(T0 + 2 * HOUR);
    step('remove access again');
    assert.equal((await removeAccess(operator, annId)).body.serverOwner!.accessRemovedAt, T0 + HOUR);
    assert.equal((await owners(operator)).find(owner => owner.id === annId)!.accessRemovedAt, T0 + HOUR);

    // Sign-in is refused, without an Invite and with a fresh one, which stays unused.
    step('sign-in refused');
    await refused('ann-code', undefined, 'access-removed');
    const fresh = await inviteLink(operator);
    await refused('ann-code', fresh, 'access-removed');
    assert.equal(count('SELECT COUNT(*) AS count FROM invites WHERE used_by IS NULL'), 1, 'the fresh Invite is still unused');

    // Their data stays, and their Live configuration cannot change: there is no session to Apply with.
    step('data kept');
    assert.deepEqual(holdings(annId), { ...before, sessions: 0 });
    const applyAttempt = await applyRoute.POST(request(`/api/game-servers/${server.id}/apply`, { token: ann, method: 'POST', body: { revision: 2, liveConfigurationId } }), params(server.id));
    assert.equal(applyAttempt.status, 401);

    // Their game server is still answered: a poll that processed the Live configuration is held,
    // and one that reports none (an interrupted delivery) gets it again.
    step('game server still answered');
    assert.deepEqual(await heldAnswer(server.key, server.id, report({ processed: processed(liveConfigurationId) })), { answer: 'no-change' });
    const again = await poll(server.key, report());
    assert.deepEqual([again.status, again.body.answer, again.body.liveConfigurationId], [200, 'live-configuration', liveConfigurationId]);
    // A build change re-delivers: the mod restarted onto the next build, which reports no
    // processed id, is sent nothing until the operator makes it the Supported build.
    step('build change');
    assert.deepEqual(await heldAnswer(server.key, server.id, report({ buildStamp: NEXT_BUILD })), { answer: 'not-supported-build' });
    await setSupportedBuild(operator, NEXT_BUILD);
    const redelivered = await poll(server.key, report({ buildStamp: NEXT_BUILD }));
    assert.deepEqual([redelivered.status, redelivered.body.answer, redelivered.body.liveConfigurationId], [200, 'live-configuration', liveConfigurationId]);
    assert.deepEqual(await heldAnswer(server.key, server.id, report({ buildStamp: NEXT_BUILD, processed: processed(liveConfigurationId) })), { answer: 'no-change' });
    assert.deepEqual(platformStore().all('SELECT id FROM live_configurations'), [{ id: liveConfigurationId }], 'the same Live configuration throughout');
  },

  async 'restore-access'() {
    const operator = await signedIn('operator-code');
    const ann = await signedIn('ann-code', await inviteLink(operator)), bob = await signedIn('bob-code', await inviteLink(operator));
    const [annId, bobId] = [idOf(ANN.id), idOf(BOB.id)];
    const server = await registered(ann, 'Ann Duel EU');
    step('remove access');
    assert.equal((await removeAccess(operator, annId)).status, 200);
    await refused('ann-code', undefined, 'access-removed');

    // Restore access clears the time; Ann signs in again, without an Invite, to her data.
    at(T0 + HOUR);
    step('restore access');
    const restored = await restoreAccess(operator, annId);
    assert.deepEqual([restored.status, restored.cache], [200, 'no-store']);
    assert.deepEqual(restored.body.serverOwner, { ...restored.body.serverOwner, id: annId, accessRemovedAt: null, gameServers: 1 });
    assert.equal(await signedInStatus(ann), 401, 'the sessions Remove access ended stay ended');
    const back = await signedIn('ann-code');
    const listed = (await answer(await gameServersRoute.GET(request('/api/game-servers', { token: back })))).body.data as { id: number }[];
    assert.deepEqual(listed.map(entry => entry.id), [server.id]);
    // Restoring access that was not removed changes nothing, and is not logged.
    step('restore access not removed');
    assert.deepEqual((await restoreAccess(operator, bobId)).body.serverOwner!.accessRemovedAt, null);
    assert.equal(await signedInStatus(bob), 200);

    // Ids that name no server owner.
    step('no such server owner');
    for (const id of ['0', '-1', 'abc', '1.5', '99999', '12345678901234567']) {
      assert.equal((await removeAccess(operator, id)).status, 404, id);
      assert.equal((await restoreAccess(operator, id)).status, 404, id);
      assert.equal((await deleteOwner(operator, id, { confirm: 'Ann Owner' })).status, 404, id);
    }
  },

  async delete() {
    const operator = await signedIn('operator-code');
    const link = await inviteLink(operator);
    const ann = await signedIn('ann-code', link);
    const bob = await signedIn('bob-code', await inviteLink(operator));
    const [operatorId, annId, bobId] = [idOf(OPERATOR.id), idOf(ANN.id), idOf(BOB.id)];
    const { server } = await annsData(ann, operator);
    const second = await registered(ann, 'Ann Duel NA');
    await save(ann, second.id, DOCUMENT);
    // Ann set the Supported build, as a platform operator at the time.
    platformStore().run('UPDATE supported_build SET set_by = ?', annId);
    // Bob's own data, which must come through untouched.
    const bobs = await registered(bob, 'Bob Arena');
    await save(bob, bobs.id, DOCUMENT);
    const bobsRuleset = await saveVersion(bob, bobs.id, 'Bob Casual');
    const bobBefore = holdings(bobId);
    assert.deepEqual(holdings(annId), { gameServers: 2, drafts: 2, liveConfigurations: 1, rulesets: 1, rulesetVersions: 1, notes: 1, sessions: 1, usedInvites: 1 });

    // The typed confirm: anything but Ann's name is refused, and nothing changes.
    step('not confirmed');
    for (const body of [undefined, {}, { confirm: '' }, { confirm: 'ann owner' }, { confirm: 'Ann' }, { confirm: ANN.username }, { confirm: 42 }, 'Ann Owner']) {
      const refusal = await deleteOwner(operator, annId, body);
      assert.deepEqual([refusal.status, refusal.body.error], [400, 'Type the server owner\'s name to delete them'], JSON.stringify(body));
    }
    assert.equal(await signedInStatus(ann), 200);

    // Delete: a poll held on one of Ann's keys is answered "key-rejected".
    at(T0 + HOUR);
    const { answered: waiting } = await held(second.key, second.id, report());
    step('delete');
    const deleted = await deleteOwner(operator, annId, { confirm: ' Ann Owner ' });
    assert.deepEqual([deleted.status, deleted.cache, deleted.body], [200, 'no-store', { success: true }]);
    assert.deepEqual(await waiting, { status: 401, body: { answer: 'key-rejected' } });
    assert.deepEqual(await poll(server.key, report()), { status: 401, body: { answer: 'key-rejected' } });

    // Everything that was Ann's alone is gone: her record, sessions, game servers with their
    // Drafts and Live configurations, Rulesets with their versions, and the Invite she used.
    step('the cascade');
    assert.equal(count('SELECT COUNT(*) AS count FROM users WHERE id = ?', annId), 0);
    assert.deepEqual(holdings(annId), { gameServers: 0, drafts: 0, liveConfigurations: 0, rulesets: 0, rulesetVersions: 0, notes: 0, sessions: 0, usedInvites: 0 });
    assert.equal(count('SELECT COUNT(*) AS count FROM drafts WHERE game_server_id IN (?, ?)', server.id, second.id), 0);
    assert.equal(count('SELECT COUNT(*) AS count FROM invites'), 1, 'only the Invite Bob used is left');
    assert.equal(await signedInStatus(ann), 401);
    // Her Note stays, by "a former server owner"; so does the Supported build she set.
    const notes = (await answer(await notesRoute.GET(request('/api/notes', { token: bob })))).body.data as { Character: Record<string, { author: string; body: string }[]> };
    assert.deepEqual(notes.Character.MaxWalkSpeed.map(note => [note.author, note.body]), [['a former server owner', '<p>Ann on walk speed</p>']]);
    const build = (await answer(await supportedBuildRoute.GET(request('/api/operator/supported-build', { token: operator })))).body as { supportedBuild: { stamp: string; setBy: string | null } };
    assert.deepEqual([build.supportedBuild.stamp, build.supportedBuild.setBy], [SUPPORTED, null]);
    // Bob's data, and the operator's, are untouched.
    assert.deepEqual(holdings(bobId), bobBefore);
    assert.equal(await signedInStatus(bob), 200);
    assert.deepEqual(((await answer(await rulesetsRoute.GET(request('/api/rulesets', { token: bob })))).body.data as { id: number }[]).map(entry => entry.id), [bobsRuleset.rulesetId]);
    assert.deepEqual((await owners(operator)).map(owner => owner.id), [operatorId, bobId]);

    // Ann is gone: every action names no one, and she is now a stranger to sign-in.
    step('gone');
    assert.equal((await deleteOwner(operator, annId, { confirm: 'Ann Owner' })).status, 404);
    assert.equal((await removeAccess(operator, annId)).status, 404);
    assert.equal((await restoreAccess(operator, annId)).status, 404);
    await refused('ann-code', link, 'invite-only');
    assert.equal(count('SELECT COUNT(*) AS count FROM users WHERE discord_id = ?', ANN.id), 0, 'and nothing about her is stored again');
  },

  async 'operator-refused'() {
    const operator = await signedIn('operator-code'), other = await signedIn('second-operator-code');
    const [operatorId, otherId] = [idOf(OPERATOR.id), idOf(SECOND_OPERATOR.id)];
    assert.deepEqual((await owners(operator)).map(owner => [owner.id, owner.operator]), [[operatorId, true], [otherId, true]]);
    // No action against a platform operator, themselves or another, whatever the confirm says.
    step('refused');
    for (const [target, name] of [[otherId, 'Otto Operator'], [operatorId, 'Olive Operator']] as const) {
      const remove = await removeAccess(operator, target);
      assert.deepEqual([remove.status, remove.body.error], [403, 'A platform operator\'s access cannot be removed']);
      const restore = await restoreAccess(operator, target);
      assert.deepEqual([restore.status, restore.body.error], [403, 'No action is taken against a platform operator']);
      const deletion = await deleteOwner(operator, target, { confirm: name });
      assert.deepEqual([deletion.status, deletion.body.error], [403, 'A platform operator cannot be deleted']);
    }
    // Nothing changed: both are still signed in, with access.
    assert.equal(await signedInStatus(operator), 200);
    assert.equal(await signedInStatus(other), 200);
    assert.deepEqual((await owners(other)).map(owner => [owner.id, owner.accessRemovedAt]), [[operatorId, null], [otherId, null]]);
  },

  async 'no-cross-owner-reads'() {
    const operator = await signedIn('operator-code'), ann = await signedIn('ann-code', await inviteLink(operator));
    const { server, liveConfigurationId, rulesetId, versionId } = await annsData(ann, operator);
    const own = await registered(operator, 'Olive Test Server');
    const ownRevision = await revisionOf(operator, own.id);
    const annBefore = JSON.stringify(platformStore().all('SELECT * FROM game_servers JOIN drafts ON drafts.game_server_id = game_servers.id WHERE owner_id = ?', idOf(ANN.id)));

    // Every route that reads or changes a game server, Draft, Live configuration or Ruleset
    // answers the operator as if Ann's were not there.
    const get = (route: { GET: (request: Request, context: ReturnType<typeof params>) => Promise<Response> }, path: string) => route.GET(request(path, { token: operator }), params(server.id));
    for (const [what, response] of [
      ['game server', await get(gameServerRoute, `/api/game-servers/${server.id}`)],
      ['Draft', await get(draftRoute, `/api/game-servers/${server.id}/draft`)],
      ['Apply review', await get(applyRoute, `/api/game-servers/${server.id}/apply`)],
      ['Draft save', await draftRoute.PUT(request(`/api/game-servers/${server.id}/draft`, { token: operator, method: 'PUT', body: { revision: 2, document: {} } }), params(server.id))],
      ['Apply', await applyRoute.POST(request(`/api/game-servers/${server.id}/apply`, { token: operator, method: 'POST', body: { revision: 2, liveConfigurationId } }), params(server.id))],
      ['Regenerate key', await regenerateRoute.POST(request(`/api/game-servers/${server.id}/regenerate-key`, { token: operator, method: 'POST' }), params(server.id))],
      ['game server delete', await gameServerRoute.DELETE(request(`/api/game-servers/${server.id}`, { token: operator, method: 'DELETE' }), params(server.id))],
      ['Ruleset rename', await rulesetRoute.PATCH(request(`/api/rulesets/${rulesetId}`, { token: operator, method: 'PATCH', body: { name: 'Mine now' } }), params(rulesetId))],
      ['Ruleset delete', await rulesetRoute.DELETE(request(`/api/rulesets/${rulesetId}`, { token: operator, method: 'DELETE' }), params(rulesetId))],
      ['Ruleset version load', await loadRoute.POST(request(`/api/game-servers/${own.id}/draft/load`, { token: operator, method: 'POST', body: { revision: ownRevision, versionId } }), params(own.id))],
      ['Ruleset version save', await saveVersionRoute.POST(request(`/api/game-servers/${own.id}/draft/save-version`, { token: operator, method: 'POST', body: { revision: ownRevision, rulesetId } }), params(own.id))],
    ] as const) assert.equal(response.status, 404, what);
    // Lists hold only the operator's own.
    assert.deepEqual(((await answer(await gameServersRoute.GET(request('/api/game-servers', { token: operator })))).body.data as { id: number }[]).map(entry => entry.id), [own.id]);
    assert.deepEqual((await answer(await rulesetsRoute.GET(request('/api/rulesets', { token: operator })))).body.data, []);
    // The operator's own pages name none of Ann's game servers, Live configurations or Rulesets.
    for (const [page, response] of [
      ['server owners', await ownersRoute.GET(request('/api/operator/server-owners', { token: operator }))],
      ['status', await statusRoute.GET(request('/api/operator/status', { token: operator }))],
      ['Invites', await invitesRoute.GET(request('/api/operator/invites', { token: operator }))],
      ['Supported build', await supportedBuildRoute.GET(request('/api/operator/supported-build', { token: operator }))],
    ] as const) {
      const { status, text } = await answer(response);
      assert.equal(status, 200, page);
      for (const of of ['Ann Duel EU', 'Ann Competitive', liveConfigurationId, 'MaxWalkSpeed']) assert(!text.includes(of), `${page}: ${of}`);
    }
    assert.equal(JSON.stringify(platformStore().all('SELECT * FROM game_servers JOIN drafts ON drafts.game_server_id = game_servers.id WHERE owner_id = ?', idOf(ANN.id))), annBefore, 'nothing of Ann\'s changed');
    assert.deepEqual(holdings(idOf(ANN.id)), { gameServers: 1, drafts: 1, liveConfigurations: 1, rulesets: 1, rulesetVersions: 1, notes: 1, sessions: 1, usedInvites: 1 });
  },
};

const run = scenarios[scenario];
if (!run) throw new Error(`Unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets] } }));
