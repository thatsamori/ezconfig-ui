/**
 * Feature review harness, shaped like the platform: a fixture sets and resets
 * values through the editor, reads back what was saved, and Applies the whole
 * configuration, which delivers a wipe then one command per non-empty category
 * in today's command encoding. There is no selective apply. It runs on the
 * self-hosted routes with temp storage and the RCON service mocked; env is set
 * before the app is imported, so each review is its own child process.
 */
import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { ConfigData, ConfigValue } from '../../src/lib/database/types';

export const WIPE = 'string ezconfig WipeDatabases';

/** The entries a batch sends for one category, as the mod reads them; undefined if it sends none. */
export function categoryEntries(batch: readonly string[], database: string, category: string): Record<string, string> | undefined {
  const command = batch.find(command => command.startsWith(`string ezconfig ${database} ${category} {`));
  return command === undefined ? undefined : JSON.parse(command.slice(command.indexOf('{')));
}

/** The commands after a batch's wipe, sorted, since their order follows storage. */
export function categoryCommands(batch: readonly string[]): string[] {
  return batch.slice(1).sort();
}

/** What every delivered batch must be, whatever builds it: a wipe, then one command per non-empty category. */
function assertDeliveredBatch(batch: readonly string[]) {
  assert.equal(batch[0], WIPE, 'a delivered batch starts with the wipe');
  const categories = batch.slice(1).map(command => {
    const match = /^string ezconfig (\S+) (\S+) (\{.*\})$/.exec(command);
    assert(match && Object.keys(JSON.parse(match[3])).length > 0, `not a non-empty category command: ${command}`);
    return `${match[1]} ${match[2]}`;
  });
  assert.equal(new Set(categories).size, categories.length, `a category is sent twice: ${categories.join(', ')}`);
}

export interface FeatureReview {
  /** Edit a value in the editor, which saves it. */
  set(database: string, category: string, key: string, value: ConfigValue): void;
  /** The editor's Reset to the game default, which removes the key. */
  reset(database: string, category: string, key: string): void;
  /** The saved value once the editor's saves finish; undefined at the game default. */
  saved(database: string, category: string, key: string): Promise<ConfigValue | undefined>;
  /** The value the editor shows, which an edit it refuses leaves as it was; undefined at the game default. */
  editorValue(database: string, category: string, key: string): ConfigValue | null | undefined;
  /** Send a save past the editor's own checks, as a hand-made request could; resolves to its status. */
  saveUnchecked(database: string, category: string, entries: Record<string, unknown>): Promise<number>;
  /** Store values without validation, as an older schema could have saved them. */
  storeUnvalidated(database: string, category: string, entries: Record<string, unknown>): Promise<void>;
  /**
   * Apply the whole configuration. Resolves to the delivered batch once the mod
   * reports success, captured under `stage` (default apply-N). A refused Apply
   * rejects, and nothing is delivered.
   */
  apply(stage?: string): Promise<string[]>;
}

export interface FeatureReviewOptions {
  /** Once the review passes, write its delivered batches here, keyed by stage (mod evidence). */
  capture?: string;
}

let reviewOpened = false;

export async function featureReview(name: string, run: (review: FeatureReview) => Promise<void>, options: FeatureReviewOptions = {}): Promise<void> {
  // The app's modules, and the env they read on import, are per process.
  assert(!reviewOpened, 'one feature review per process: run each review as its own child fixture');
  reviewOpened = true;
  const parent = resolve(tmpdir());
  const prefix = `ezconfig-review-${name}-`;
  const root = await mkdtemp(join(parent, prefix));
  const storage = {
    DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'),
    NOTES_PATH: join(root, 'Notes'), USERS_PATH: join(root, 'users.json'),
  };
  // Nothing real is reachable: storage is in the temp root, RCON is mocked, and its host is loopback.
  Object.assign(process.env, storage, { RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' });
  const delivered: string[][] = [];
  const stages: Record<string, string[]> = {};
  mock.module('../../src/lib/rcon/service', () => ({
    executeAcknowledgedBatch: async (commands: readonly string[]) => {
      delivered.push([...commands]);
      return successfulProcessingFixture(commands);
    },
  }));
  const originalFetch = globalThis.fetch;
  let settle = async () => {};
  try {
    const { env } = await import('../../src/lib/env');
    assert.deepEqual([env.databasesPath, env.presetsPath, env.notesPath, env.usersPath, env.rcon.host],
      [storage.DATABASES_PATH, storage.PRESETS_PATH, storage.NOTES_PATH, storage.USERS_PATH, '127.0.0.1'],
      'the app was imported before the review set its env: import it only inside the review');
    await mkdir(storage.DATABASES_PATH);
    const { POST: saveCategory, GET: readCategory } = await import('../../src/app/api/config/[...path]/route');
    const { POST: applyRoute } = await import('../../src/app/api/apply/route');
    const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
    const { patchCategory } = await import('../../src/lib/database/service');
    settle = () => flushConfigWrites().catch(() => {});
    const at = (path: string[]) => ({ params: Promise.resolve({ path }) });
    const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // The editor's per-category saves go straight into the real handler; nothing else is served.
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const path = url.startsWith('/api/config/') ? url.slice('/api/config/'.length).split('/') : [];
      assert.equal(path.length, 2, `the harness does not serve ${url}`);
      return saveCategory(new Request('http://localhost' + url, init) as never, at(path));
    }) as unknown as typeof fetch;
    const store = useConfigStore.getState();
    await run({
      set: (database, category, key, value) => store.setValue(database, category, key, value),
      reset: (database, category, key) => store.removeValue(database, category, key),
      async saved(database, category, key) {
        await flushConfigWrites();
        const response = await readCategory(new Request('http://localhost') as never, at([database, category]));
        assert.equal(response.status, 200);
        return (await response.json()).data[key];
      },
      editorValue: (database, category, key) => store.getValue(database, category, key),
      async saveUnchecked(database, category, entries) {
        return (await saveCategory(new Request('http://localhost', json('PATCH', { entries })) as never, at([database, category]))).status;
      },
      storeUnvalidated: (database, category, entries) => patchCategory(database, category, entries as ConfigData),
      async apply(stage = `apply-${Object.keys(stages).length + 1}`) {
        assert(!Object.hasOwn(stages, stage), `stage ${stage} is already captured`);
        await flushConfigWrites();
        const before = delivered.length;
        // A refusal is the rejection itself, so the route's log goes into it rather than stderr.
        const logged: unknown[][] = [], log = console.error;
        console.error = (...args: unknown[]) => { logged.push(args); };
        // No commands in the request: the whole saved configuration, after a wipe.
        const response = await applyRoute(new Request('http://localhost/api/apply', json('POST', {})))
          .finally(() => { console.error = log; });
        if (response.status !== 200) {
          assert.equal(delivered.length, before, 'a refused Apply delivers nothing');
          throw new Error(`Apply was refused (${response.status}): ${(await response.json()).error}`, { cause: logged });
        }
        for (const args of logged) console.error(...args);
        assert.equal(delivered.length, before + 1, 'Apply delivers one batch');
        assertDeliveredBatch(delivered[before]);
        stages[stage] = delivered[before];
        return [...delivered[before]];
      },
    });
    if (options.capture) {
      await mkdir(dirname(options.capture), { recursive: true });
      await writeFile(options.capture, JSON.stringify(stages, null, 2) + '\n', 'utf8');
    }
  } finally {
    await settle();
    globalThis.fetch = originalFetch;
    const target = resolve(root);
    assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith(prefix));
    await rm(target, { recursive: true, force: true });
  }
}
