import { afterEach, expect, test } from 'bun:test';
import { useConfigStore, flushConfigWrites, fieldName } from '../src/lib/store/configStore';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
type Call = { method: string; url: string; body?: { revision: number; document?: unknown } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Serves the Draft's GET with `revision`, and answers each write with `answer`, recording every request. */
function serve(answer: (call: Call, calls: Call[]) => Response | Promise<Response>, revision = 3) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const call = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined };
    if (call.method === 'GET') return json({ success: true, data: { values: { character: {}, weapons: {} }, revision, savedAt: null, dropped: 0 } });
    calls.push(call);
    return answer(call, calls);
  }) as unknown as typeof fetch;
  return calls;
}
const saved = (call: Call) => json({ success: true, data: { revision: call.body!.revision + 1, savedAt: 1 } });
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
test('a stale Draft takes no more saves until it is opened again', async () => {
  const calls = serve(() => json({ success: false, error: 'The Draft changed since this page loaded it' }, 409));
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  await expect(flushConfigWrites()).rejects.toThrow('changed in another tab');
  store.setValue('Axe', 'Strike', 'Windup', 0.5);
  await expect(flushConfigWrites()).rejects.toThrow('changed in another tab');
  expect(calls).toHaveLength(1);
  await store.openDraft(7);
  expect(useConfigStore.getState()).toMatchObject({ saveState: 'saved', values: { character: {}, weapons: {} } });
});
test('an invalid preset fails before the Draft is replaced', async () => {
  const calls = serve(saved);
  const store = useConfigStore.getState();
  await store.openDraft(7);
  store.setValue('Axe', 'Strike', 'Windup', 0.3);
  await flushConfigWrites();
  const previous = useConfigStore.getState().values;
  await expect(store.loadPreset({ character: { Camera: { CustomFOV: true, CustomFOVMax: 120.5 } }, weapons: {} })).rejects.toThrow('whole number');
  expect(useConfigStore.getState().values).toBe(previous);
  expect(calls).toHaveLength(1);
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
