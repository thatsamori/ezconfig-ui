import { afterEach, expect, test } from 'bun:test';
import { useConfigStore, flushConfigWrites, fieldName, type DraftValues } from '../src/lib/store/configStore';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
type Call = { method: string; url: string; body?: { revision: number; document?: unknown } & Record<string, unknown> };
type View = { values: DraftValues; revision: number; savedAt: number | null; dropped: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const empty = (revision = 3): View => ({ values: { character: {}, weapons: {} }, revision, savedAt: null, dropped: 0 });
/** Serves the Draft's GET with `draft()`, and answers each write with `answer`, recording every write. */
function serve(answer: (call: Call, calls: Call[]) => Response | Promise<Response>, draft: () => View | Promise<View> = empty) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const call = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined };
    if (call.method === 'GET') return json({ success: true, data: await draft() });
    calls.push(call);
    return answer(call, calls);
  }) as unknown as typeof fetch;
  return calls;
}
const saved = (call: Call) => json({ success: true, data: { revision: call.body!.revision + 1, savedAt: 1 } });
/** Another tab's Draft at `revision`: MaxWalkSpeed 600 and the Axe's Strike Windup at 0.3. */
const theirs = (revision: number): View => ({ values: { character: { Movement: { MaxWalkSpeed: 600 } }, weapons: { Axe: { Strike: { Windup: 0.3 } } } }, revision, savedAt: 9, dropped: 0 });
const stale = (draft: View) => json({ success: false, error: 'The Draft changed since this page loaded it', data: draft }, 409);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('each save sends the whole Draft with its revision; edits made during a save go in the next', async () => {
  const resolvers: (() => void)[] = [];
  const calls = serve(async call => {
    await new Promise<void>(resolve => resolvers.push(resolve));
    return saved(call);
  });
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.4);
  store.setValue('Character', 'Movement', 'CanDodge', false);
  await Promise.resolve();
  expect(calls).toEqual([{ method: 'PUT', url: '/api/game-servers/7/draft', body: { revision: 3, document: { Weapon: { Axe: { Strike: { Windup: 0.4 } } } } } }]);
  resolvers[0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls[1].body).toEqual({ revision: 4, document: { Character: { CanDodge: false }, Weapon: { Axe: { Strike: { Windup: 0.4 } } } } });
  resolvers[1]();
  await flushConfigWrites();
  expect(useConfigStore.getState().draft).toMatchObject({ gameServerId: 7, revision: 5 });
  // A reset removes the key from the document.
  store.removeValue('Axe', 'Strike', 'Windup');
  await new Promise(resolve => setTimeout(resolve, 0));
  resolvers[2]();
  await flushConfigWrites();
  expect(calls[2].body).toEqual({ revision: 5, document: { Character: { CanDodge: false } } });
});
test("a refused save names each field's error, and keeps the edit for fixing", async () => {
  serve(() => json({ success: false, error: 'Validation failed', details: [{ database: 'Axe', category: 'Strike', key: 'Windup', error: 'Expected Float, got String' }] }, 400));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValues([{ database: 'Axe', category: 'Strike', key: 'Windup', value: 'slow' }]);
  await expect(flushConfigWrites()).rejects.toThrow('Not saved: Windup Expected Float, got String');
  expect(useConfigStore.getState()).toMatchObject({ saveState: 'invalid', fieldErrors: { [fieldName('Axe', 'Strike', 'Windup')]: 'Expected Float, got String' } });
  expect(store.getValue('Axe', 'Strike', 'Windup')).toBe('slow');
  expect(useConfigStore.getState().draft?.revision).toBe(3);
});
test('a save that does not arrive is retried with the whole Draft', async () => {
  let fail = true;
  const calls = serve(call => fail ? json({}, 500) : saved(call));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  await expect(flushConfigWrites()).rejects.toThrow('Could not save the Draft (500)');
  expect(useConfigStore.getState().saveState).toBe('failed');
  fail = false;
  store.retrySave();
  await flushConfigWrites();
  expect(calls.map(call => call.body)).toEqual([{ revision: 3, document: { Weapon: { Axe: { Strike: { Windup: 0.3 } } } } }, { revision: 3, document: { Weapon: { Axe: { Strike: { Windup: 0.3 } } } } }]);
});
test("a rejected save takes the current Draft in place of the tab's and names each edit it did not save", async () => {
  const resolvers: (() => void)[] = [];
  const calls = serve(async call => {
    await new Promise<void>(resolve => resolvers.push(resolve));
    return call.body!.revision === 3 ? stale(theirs(4)) : saved(call);
  }, () => ({ ...empty(), values: { character: { Movement: { MaxWalkSpeed: 450 } }, weapons: {} } }));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValues([
    { database: 'Character', category: 'Movement', key: 'CanDodge', value: false },
    { database: 'Character', category: 'Movement', key: 'MaxWalkSpeed', value: null },
    // The other tab saved the same value: not lost.
    { database: 'Axe', category: 'Strike', key: 'Windup', value: 0.3 },
  ]);
  await Promise.resolve();
  // An edit made while the rejected save is in flight is lost with it.
  store.setValues([{ database: 'Axe', category: 'AltStab', key: 'Damage', value: [50, 45, 40] }]);
  const flushed = flushConfigWrites();
  resolvers[0]();
  await expect(flushed).rejects.toThrow('The Draft changed in another tab, so 3 edits here were not saved: Character · Movement · CanDodge, Axe · AltStab · Damage, Character · Movement · MaxWalkSpeed.');
  expect(useConfigStore.getState()).toMatchObject({
    values: theirs(4).values,
    draft: { gameServerId: 7, revision: 4, savedAt: 9, base: theirs(4).values },
    saveState: 'saved',
    unsaved: [
      { database: 'Character', category: 'Movement', key: 'CanDodge', value: false },
      { database: 'Axe', category: 'AltStab', key: 'Damage', value: [50, 45, 40] },
      { database: 'Character', category: 'Movement', key: 'MaxWalkSpeed', value: null },
    ],
  });
  expect(calls).toHaveLength(1);
  // The tab keeps editing on the current revision, and the named edits stay until dismissed.
  store.setValue('Character', 'Movement', 'CanDodge', false);
  await Promise.resolve();
  resolvers[1]();
  await flushConfigWrites();
  expect(calls[1].body).toEqual({ revision: 4, document: { Character: { MaxWalkSpeed: 600, CanDodge: false }, Weapon: { Axe: { Strike: { Windup: 0.3 } } } } });
  expect(useConfigStore.getState().unsaved).toHaveLength(3);
  store.dismissUnsaved();
  expect(useConfigStore.getState().unsaved).toEqual([]);
});
test('Reset to game defaults on a stale revision takes the current Draft and resets nothing', async () => {
  serve(call => call.url.endsWith('/reset') ? stale(theirs(4)) : saved(call));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  await expect(store.resetToGameDefaults()).rejects.toThrow('Not reset: the Draft changed in another tab');
  expect(useConfigStore.getState()).toMatchObject({ values: theirs(4).values, draft: { revision: 4 }, saveState: 'saved', unsaved: [] });
});
test("a refresh picks up another tab's saves, and changes nothing while the Draft has not moved", async () => {
  let current = empty();
  let gets = 0;
  const calls = serve(saved, () => {
    gets++;
    return current;
  });
  const store = useConfigStore.getState();
  await store.openDraft(7);
  const opened = useConfigStore.getState().values;
  await store.refreshDraft();
  expect(useConfigStore.getState().values).toBe(opened);
  current = theirs(4);
  await store.refreshDraft();
  expect(useConfigStore.getState()).toMatchObject({ values: theirs(4).values, draft: { revision: 4, savedAt: 9 }, saveState: 'saved', unsaved: [] });
  expect(gets).toBe(3);
  // The next save is based on it.
  store.setValue('Character', 'Movement', 'CanDodge', false);
  await flushConfigWrites();
  expect(calls[0].body!.revision).toBe(4);
});
test('a refresh never replaces an edit being typed or still saving', async () => {
  let current = empty();
  let answer: (draft: View) => void = () => {};
  let hold = false;
  const resolvers: (() => void)[] = [];
  serve(async call => {
    await new Promise<void>(resolve => resolvers.push(resolve));
    return call.body!.revision === 3 ? stale(theirs(4)) : saved(call);
  }, () => hold ? new Promise<View>(resolve => answer = resolve) : current);
  const store = useConfigStore.getState();
  await store.openDraft(7);
  current = theirs(4);
  // While a value is being typed, nothing is fetched or replaced.
  let typing = true;
  await store.refreshDraft(() => typing);
  expect(useConfigStore.getState().draft?.revision).toBe(3);
  // Typing that starts while the Draft is being fetched keeps it from being taken.
  typing = false;
  hold = true;
  let refreshed = store.refreshDraft(() => typing);
  await tick();
  typing = true;
  answer(theirs(4));
  await refreshed;
  expect(useConfigStore.getState().draft?.revision).toBe(3);
  // An edit made during the fetch is saving when the answer arrives: the answer is not taken over it.
  typing = false;
  refreshed = store.refreshDraft(() => typing);
  await tick();
  store.setValue('Character', 'Movement', 'CanDodge', false);
  answer(theirs(4));
  await refreshed;
  expect(useConfigStore.getState()).toMatchObject({ values: { character: { Movement: { CanDodge: false } } }, draft: { revision: 3 }, saveState: 'saving' });
  // Nor is one started while it saves; the save's own rejection names the edit.
  hold = false;
  await store.refreshDraft();
  expect(useConfigStore.getState().draft?.revision).toBe(3);
  resolvers[0]();
  await expect(flushConfigWrites()).rejects.toThrow('an edit here was not saved: Character · Movement · CanDodge.');
  expect(useConfigStore.getState()).toMatchObject({ values: theirs(4).values, unsaved: [{ database: 'Character', category: 'Movement', key: 'CanDodge', value: false }] });
});
test("a refresh that finds another tab's save names the edits here that were refused", async () => {
  let current = empty();
  serve(() => json({ success: false, error: 'Validation failed', details: [{ database: 'Axe', category: 'Strike', key: 'Windup', error: 'Expected Float, got String' }] }, 400), () => current);
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValues([{ database: 'Axe', category: 'Strike', key: 'Windup', value: 'slow' }]);
  await expect(flushConfigWrites()).rejects.toThrow('Not saved: Windup');
  current = theirs(4);
  await store.refreshDraft();
  expect(useConfigStore.getState()).toMatchObject({ values: theirs(4).values, draft: { revision: 4 }, saveState: 'saved', fieldErrors: {}, unsaved: [{ database: 'Axe', category: 'Strike', key: 'Windup', value: 'slow' }] });
});
const origin = { rulesetId: 2, rulesetName: 'Competitive', versionId: 11, number: 3, modified: false };
test('Save as Ruleset version saves the edits first, sends the revision, and takes the new version as the origin', async () => {
  const calls = serve(call => call.url.endsWith('/save-version')
    ? json({ success: true, data: { ruleset: { id: 2, name: 'Competitive' }, version: { id: 11, number: 3, description: 'Faster', savedAt: 5 }, draft: { ...empty(call.body!.revision + 1), values: { character: {}, weapons: { Axe: { Strike: { Windup: 0.3 } } } }, savedAt: 5, origin } } }, 201)
    : saved(call));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  const result = await store.saveRulesetVersion({ rulesetId: 2 }, 'Faster');
  expect(result).toEqual({ ruleset: { id: 2, name: 'Competitive' }, version: { id: 11, number: 3, description: 'Faster', savedAt: 5 } });
  expect(calls.map(call => [call.url, call.body])).toEqual([
    ['/api/game-servers/7/draft', { revision: 3, document: { Weapon: { Axe: { Strike: { Windup: 0.3 } } } } }],
    ['/api/game-servers/7/draft/save-version', { revision: 4, rulesetId: 2, description: 'Faster' }],
  ]);
  expect(useConfigStore.getState()).toMatchObject({ draft: { revision: 5, origin }, saveState: 'saved' });
});
test('loading a Ruleset version replaces the whole Draft with the revision checked, and names the loaded values this build refuses', async () => {
  const loadedValues = { character: { Camera: { CustomFOV: true, CustomFOVMax: 120.5 } }, weapons: {} };
  const calls = serve(call => call.url.endsWith('/load')
    ? json({ success: true, data: { draft: { ...empty(call.body!.revision + 1), values: loadedValues, origin }, dropped: 2, errors: [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'CustomFOVMax must be a whole number' }] } })
    : saved(call));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  expect(await store.loadRulesetVersion(11)).toEqual({ dropped: 2, errors: [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'CustomFOVMax must be a whole number' }] });
  expect(calls.map(call => [call.url, call.body])).toEqual([
    ['/api/game-servers/7/draft', { revision: 3, document: { Weapon: { Axe: { Strike: { Windup: 0.3 } } } } }],
    ['/api/game-servers/7/draft/load', { revision: 4, versionId: 11 }],
  ]);
  expect(useConfigStore.getState()).toMatchObject({ values: loadedValues, draft: { revision: 5, origin }, fieldErrors: { [fieldName('Character', 'Camera', 'CustomFOVMax')]: 'CustomFOVMax must be a whole number' } });
});
test('a stale Ruleset load or save takes the current Draft, names the lost edits, and changes nothing', async () => {
  const calls = serve(call => call.url.endsWith('/draft') ? saved(call) : stale(theirs(9)));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  await expect(store.loadRulesetVersion(11)).rejects.toThrow('Not loaded: the Draft changed in another tab');
  expect(useConfigStore.getState()).toMatchObject({ values: theirs(9).values, draft: { revision: 9 }, unsaved: [] });
  await expect(store.saveRulesetVersion({ name: 'Duel' }, '')).rejects.toThrow('Not saved as a Ruleset version');
  expect(calls.map(call => [call.url, call.body])).toEqual([
    ['/api/game-servers/7/draft/load', { revision: 3, versionId: 11 }],
    ['/api/game-servers/7/draft/save-version', { revision: 9, name: 'Duel', description: '' }],
  ]);
});
test("a refresh at the same revision takes the origin a Ruleset's rename or delete changed", async () => {
  let current: View & { origin?: typeof origin | null } = { ...empty(), origin };
  serve(saved, () => current);
  const store = useConfigStore.getState();
  await store.openDraft(7);
  expect(useConfigStore.getState().draft?.origin).toEqual(origin);
  current = { ...empty(), origin: null };
  await store.refreshDraft();
  expect(useConfigStore.getState().draft).toMatchObject({ revision: 3, origin: null });
});
test('Reset to game defaults sends the revision and opens the emptied Draft', async () => {
  const calls = serve(call => call.url.endsWith('/reset')
    ? json({ success: true, data: { values: { character: {}, weapons: {} }, revision: call.body!.revision + 1, savedAt: 2, dropped: 0 } })
    : saved(call));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  await store.resetToGameDefaults();
  expect(calls.map(call => [call.url, call.body?.revision])).toEqual([['/api/game-servers/7/draft', 3], ['/api/game-servers/7/draft/reset', 4]]);
  expect(useConfigStore.getState()).toMatchObject({ values: { character: {}, weapons: {} }, draft: { revision: 5, savedAt: 2 } });
});
