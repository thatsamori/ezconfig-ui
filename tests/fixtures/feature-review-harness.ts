/**
 * Feature review harness, shaped like the platform: a fixture sets and resets
 * values through the editor, which auto-saves a game server's Draft, reads
 * back what was saved, and Applies the whole Draft as the encoder builds it: a
 * wipe then one command per non-empty category in today's command encoding.
 * There is no selective apply. It runs on the Draft routes, signed in with a
 * platform session, with temp storage and the RCON service mocked; env is set
 * before the app is imported, so each review is its own child process.
 */
import { successfulProcessingFixture } from './acknowledged-transport';
import { signInForTest } from '../helpers/platform-session';
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
  /** Store values without validation, as an older schema could have saved them; the editor then opens the Draft again. */
  storeUnvalidated(database: string, category: string, entries: Record<string, unknown>): Promise<void>;
  /**
   * Apply the whole Draft. Resolves to the delivered batch, captured under
   * `stage` (default apply-N). A refused Apply rejects, and nothing is
   * delivered.
   */
  apply(stage?: string): Promise<string[]>;
  /** Batches the self-hosted automatic sync delivered on its own (its startup snapshot), oldest first; its RCON is mocked. */
  synced(): string[][];
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
    NOTES_PATH: join(root, 'Notes'), DATABASE_PATH: join(root, 'platform.db'),
  };
  // Nothing real is reachable: storage is in the temp root, RCON is mocked, and its host is loopback.
  Object.assign(process.env, storage, { RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' });
  const stages: Record<string, string[]> = {};
  const synced: string[][] = [];
  mock.module('../../src/lib/rcon/service', () => ({
    executeAcknowledgedBatch: async () => assert.fail('Apply builds its batch with the encoder: nothing is sent over the self-hosted RCON path'),
    // The automatic sync's own target: until online-platform#41 it delivers the self-hosted files.
    executeAcknowledgedBatchAt: async (_target: unknown, commands: readonly string[]) => {
      synced.push([...commands]);
      return successfulProcessingFixture(commands);
    },
  }));
  const originalFetch = globalThis.fetch;
  let settle = async () => {};
  let closeStore = () => {};
  try {
    const { env } = await import('../../src/lib/env');
    assert.deepEqual([env.databasesPath, env.presetsPath, env.notesPath, env.databasePath, env.rcon.host],
      [storage.DATABASES_PATH, storage.PRESETS_PATH, storage.NOTES_PATH, storage.DATABASE_PATH, '127.0.0.1'],
      'the app was imported before the review set its env: import it only inside the review');
    await mkdir(storage.DATABASES_PATH);
    const { closePlatformStore, platformStore } = await import('../../src/lib/platform/storage');
    closeStore = closePlatformStore;
    // Every route needs a session; the editor's requests and the review's all carry this one.
    const session = await signInForTest();
    const { POST: register } = await import('../../src/app/api/game-servers/route');
    const { GET: readDraftRoute, PUT: saveDraftRoute } = await import('../../src/app/api/game-servers/[id]/draft/route');
    const { POST: resetDraftRoute } = await import('../../src/app/api/game-servers/[id]/draft/reset/route');
    const { readDraft } = await import('../../src/lib/platform/drafts');
    const { commandBatch } = await import('../../src/lib/config/encodeValues');
    const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
    const { patchCategory } = await import('../../src/lib/database/service');
    settle = () => flushConfigWrites().catch(() => {});
    const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const registered = await register(session.request('/api/game-servers', json('POST', { name: `Review ${name}` })));
    assert.equal(registered.status, 201, 'the review registers its game server');
    const gameServerId: number = (await registered.json()).data.gameServer.id;
    const draftUrl = `/api/game-servers/${gameServerId}/draft`;
    const at = { params: Promise.resolve({ id: String(gameServerId) }) };
    // The editor's Draft requests go straight into the real handlers; nothing else is served.
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const request = session.request(url, init);
      if (url === draftUrl && method === 'GET') return readDraftRoute(request, at);
      if (url === draftUrl && method === 'PUT') return saveDraftRoute(request, at);
      if (url === `${draftUrl}/reset` && method === 'POST') return resetDraftRoute(request, at);
      assert.fail(`the harness does not serve ${method} ${url}`);
    }) as unknown as typeof fetch;
    const store = useConfigStore.getState();
    /** The editor opens the Draft, as the game server page does; again after another writer saves it. */
    const open = async () => {
      await store.openDraft(gameServerId);
      assert.equal(useConfigStore.getState().draft?.gameServerId, gameServerId, useConfigStore.getState().loadError || 'the editor opens the Draft');
    };
    await open();
    /** The stored Draft with each entry set, or removed where it is null: Character and General keys by key, attack keys under their attack. */
    const withEntries = (database: string, category: string, entries: Record<string, unknown>) => {
      const { document, revision } = readDraft(gameServerId)!;
      for (const [key, value] of Object.entries(entries)) {
        const path = database === 'Character' ? ['Character', key] : category === 'General' ? ['Weapon', database, key] : ['Weapon', database, category, key];
        let target = document as Record<string, unknown>;
        for (const name of path.slice(0, -1)) target = (target[name] ??= {}) as Record<string, unknown>;
        if (value === null) delete target[key];
        else target[key] = value;
      }
      return { document, revision };
    };
    await run({
      set: (database, category, key, value) => store.setValue(database, category, key, value),
      reset: (database, category, key) => store.removeValue(database, category, key),
      async saved(database, category, key) {
        await flushConfigWrites();
        const response = await readDraftRoute(session.request(draftUrl), at);
        assert.equal(response.status, 200);
        const { values } = (await response.json()).data;
        return database === 'Character' ? values.character[category]?.[key] : values.weapons[database]?.[category]?.[key];
      },
      editorValue: (database, category, key) => store.getValue(database, category, key),
      async saveUnchecked(database, category, entries) {
        await flushConfigWrites();
        // The whole stored Draft with these entries in it, at its current revision; a null is Reset.
        const response = await saveDraftRoute(session.request(draftUrl, json('PUT', withEntries(database, category, entries))), at);
        if (response.ok) await open();
        return response.status;
      },
      async storeUnvalidated(database, category, entries) {
        await flushConfigWrites();
        const { document } = withEntries(database, category, entries);
        platformStore().run('UPDATE drafts SET overrides = ?, revision = revision + 1 WHERE game_server_id = ?', JSON.stringify(document), gameServerId);
        // Until online-platform#41 the self-hosted startup migration and automatic sync read the files.
        await patchCategory(database, category, entries as ConfigData);
        await open();
      },
      async apply(stage = `apply-${Object.keys(stages).length + 1}`) {
        assert(!Object.hasOwn(stages, stage), `stage ${stage} is already captured`);
        await flushConfigWrites();
        // The whole saved Draft, after a wipe. A refusal reads as the self-hosted Apply's did, which reviews match.
        let batch: string[];
        try {
          batch = commandBatch(readDraft(gameServerId)!.document);
        } catch (error) {
          throw new Error(`Apply was refused (500): ${(error as Error).message}`, { cause: error });
        }
        assertDeliveredBatch(batch);
        stages[stage] = batch;
        return [...batch];
      },
      synced: () => synced.map(batch => [...batch]),
    });
    if (options.capture) {
      await mkdir(dirname(options.capture), { recursive: true });
      await writeFile(options.capture, JSON.stringify(stages, null, 2) + '\n', 'utf8');
    }
  } finally {
    await settle();
    closeStore();
    globalThis.fetch = originalFetch;
    const target = resolve(root);
    assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith(prefix));
    await rm(target, { recursive: true, force: true });
  }
}
