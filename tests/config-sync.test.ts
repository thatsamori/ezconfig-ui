import { afterEach, expect, test } from 'bun:test';
import { createConfigSync, type ConfigSyncStatus, type EditingField } from '../src/lib/store/configSync';
import { beginConfigMutation, flushConfigWrites, useConfigStore } from '../src/lib/store/configStore';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const values = (entries = {}) => ({ character: { Movement: entries }, weapons: {} });
const reply = (revision: string, entries = {}) => new Response(JSON.stringify({ success: true, revision, savedAt: '2026-09-10T01:00:00.000Z', values: values(entries) }));

test('unchanged revisions fetch metadata only; changed snapshots replace values including removals', async () => {
  const calls: string[] = [];
  let revision = 'one';
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    expect(init?.cache).toBe('no-store');
    return reply(revision, revision === 'one' ? { CanDodge: true } : {});
  }) as unknown as typeof fetch;
  const sync = createConfigSync({ canApply: () => true, onStatus: () => {} });
  await sync.poll();
  await sync.poll();
  expect(calls).toEqual(['/api/databases/overrides', '/api/config/revision']);
  revision = 'two';
  await sync.poll();
  expect(calls.slice(-2)).toEqual(['/api/config/revision', '/api/databases/overrides']);
  expect(useConfigStore.getState().values).toEqual(values());
  expect(useConfigStore.getState().savedValues).toBe(useConfigStore.getState().values);
  sync.dispose();
});

test('a local edit invalidates an in-flight snapshot even if its save finishes before the read', async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = (() => new Promise(resolve => { release = resolve; })) as unknown as typeof fetch;
  const sync = createConfigSync({ canApply: () => true, onStatus: () => {} });
  const polling = sync.poll();
  const finish = beginConfigMutation();
  const edited = values({ CanDodge: false });
  useConfigStore.setState({ values: edited });
  finish();
  release(reply('stale', { CanDodge: true }));
  await polling;
  expect(useConfigStore.getState().values).toBe(edited);
  globalThis.fetch = (async () => reply('fresh', { CanDodge: false })) as unknown as typeof fetch;
  await sync.poll();
  expect(useConfigStore.getState().values).toEqual(edited);
  sync.dispose();
});

test('focused drafts survive remote resets while adjacent values update, then catch up on blur', async () => {
  let snapshots = 0;
  let field: EditingField | null = { database: 'Character', category: 'Movement', key: 'CanDodge' };
  let revision = 'one';
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).endsWith('overrides')) snapshots++;
    return reply(revision, revision === 'one' ? { CanDodge: true } : { MaxWalkSpeed: 600 });
  }) as unknown as typeof fetch;
  const sync = createConfigSync({ canApply: () => true, editingField: () => field, onStatus: () => {} });
  field = null;
  await sync.poll();
  field = { database: 'Character', category: 'Movement', key: 'CanDodge' };
  revision = 'two';
  await sync.poll();
  expect(useConfigStore.getState().values.character.Movement).toEqual({ CanDodge: true, MaxWalkSpeed: 600 });
  await sync.poll();
  expect(snapshots).toBe(2);
  field = null;
  await sync.poll();
  expect(useConfigStore.getState().values.character.Movement).toEqual({ MaxWalkSpeed: 600 });
  expect(snapshots).toBe(2);
  sync.dispose();
});

test('failed refreshes retain the revision for retry and recover without replacing the screen', async () => {
  const statuses: ConfigSyncStatus[] = [];
  globalThis.fetch = (async () => reply('one')) as unknown as typeof fetch;
  const sync = createConfigSync({ canApply: () => true, onStatus: s => statuses.push(s) });
  await sync.poll();
  globalThis.fetch = (async (url: unknown) => String(url).endsWith('revision') ? reply('two') : new Response('{}', { status: 500 })) as unknown as typeof fetch;
  await sync.poll();
  expect(statuses.at(-1)?.loading).toBe(false);
  expect(statuses.at(-1)?.error).toContain('Retrying');
  globalThis.fetch = (async () => reply('two', { CanDodge: false })) as unknown as typeof fetch;
  await sync.poll();
  expect(statuses.at(-1)?.error).toBe('');
  expect(useConfigStore.getState().values).toEqual(values({ CanDodge: false }));
  sync.dispose();
});

test('polls do not overlap and disposed responses cannot change the store', async () => {
  let release!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = (() => { calls++; return new Promise(resolve => { release = resolve; }); }) as unknown as typeof fetch;
  const sync = createConfigSync({ canApply: () => true, onStatus: () => { throw new Error('disposed'); } });
  const previous = useConfigStore.getState().values;
  const polling = sync.poll();
  await sync.poll();
  expect(calls).toBe(1);
  sync.dispose();
  release(reply('one'));
  await polling;
  expect(useConfigStore.getState().values).toBe(previous);
});

test('retrying after a failed save retains failed fields when a different field is edited', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  useConfigStore.getState().setValue('Axe', 'Strike', 'Windup', 0.5);
  await expect(flushConfigWrites()).rejects.toThrow();
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('PATCH');
    bodies.push(JSON.parse(String(init?.body)).entries);
    return new Response('{}');
  }) as unknown as typeof fetch;
  useConfigStore.getState().setValue('Axe', 'Strike', 'CanCombo', false);
  await flushConfigWrites();
  expect(bodies).toEqual([{ Windup: 0.5, CanCombo: false }]);
});
