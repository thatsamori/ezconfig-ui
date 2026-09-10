import { afterEach, expect, test } from 'bun:test';
import { useConfigStore, flushConfigWrites } from '../src/lib/store/configStore';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('rapid category edits finish in order and send only changed keys', async () => {
  const bodies: Record<string, unknown>[] = [];
  const resolvers: (() => void)[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)).entries);
    await new Promise<void>(resolve => resolvers.push(resolve));
    return new Response('{}');
  }) as unknown as typeof fetch;
  const store = useConfigStore.getState();
  store.setValue('Axe', 'Strike', 'Windup', 0.4);
  store.setValue('Axe', 'Strike', 'CanCombo', false);
  await Promise.resolve();
  expect(bodies).toEqual([{
    Windup: 0.4
  }]);
  resolvers[0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(bodies[1]).toEqual({
    CanCombo: false
  });
  resolvers[1]();
  await flushConfigWrites();
});
test('failed saves block review until a successful retry', async () => {
  globalThis.fetch = (async () => new Response('{}', {
    status: 500
  })) as unknown as typeof fetch;
  useConfigStore.getState().setValue('Axe', 'Strike', 'Windup', 0.3);
  await expect(flushConfigWrites()).rejects.toThrow('could not be saved');
  globalThis.fetch = (async () => new Response('{}')) as unknown as typeof fetch;
  useConfigStore.getState().setValue('Axe', 'Strike', 'Windup', 0.3);
  await flushConfigWrites();
});
test('a failed preset clear preserves the working set and reports failure', async () => {
  const previous = useConfigStore.getState().values;
  globalThis.fetch = (async () => new Response('{}', {
    status: 500
  })) as unknown as typeof fetch;
  await expect(useConfigStore.getState().loadPreset({
    character: {},
    weapons: {}
  })).rejects.toThrow('clear existing config');
  expect(useConfigStore.getState().values).toBe(previous);
});
