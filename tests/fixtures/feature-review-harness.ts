/**
 * Feature review harness, shaped like the platform: a fixture sets and resets
 * values through the editor, which auto-saves a game server's Draft, reads
 * back what was saved, and Applies the whole Draft. There is no selective
 * apply. Apply is the real one: the review's route, then Apply's, which wakes
 * the poll the game server holds on the Supported build. The delivered Live
 * configuration is the batch: a wipe then one command per non-empty category
 * in today's command encoding. The game server, a simulated mod, then reports
 * processing it and polls again, which makes the Live configuration
 * Confirmed. It runs on the platform's routes, signed in with a platform
 * session, on a temp platform database; env is set before the app is
 * imported, so each review is its own child process.
 */
import { signInForTest } from '../helpers/platform-session';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { ConfigValue } from '../../src/lib/database/types';

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
   * Apply the whole Draft. Resolves to the batch the held poll delivered,
   * captured under `stage` (default apply-N). A refused Apply rejects with
   * `Apply was refused (status): error`, and nothing is delivered.
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
  const storage = { DATABASE_PATH: join(root, 'platform.db') };
  // Nothing real is reachable: the platform database is in the temp root, and the game server is simulated in-process.
  Object.assign(process.env, storage);
  const stages: Record<string, string[]> = {};
  const originalFetch = globalThis.fetch;
  let settle = async () => {};
  let closeStore = () => {};
  /** Hangs up the game server's held poll, which would otherwise outlive the review, and waits for it to end. */
  let hangUp = async () => {};
  try {
    const { env } = await import('../../src/lib/env');
    assert.equal(env.databasePath, storage.DATABASE_PATH, 'the app was imported before the review set its env: import it only inside the review');
    const { closePlatformStore, platformStore } = await import('../../src/lib/platform/storage');
    closeStore = closePlatformStore;
    // Every route needs a session; the editor's requests and the review's all carry this one.
    const session = await signInForTest();
    const { POST: register } = await import('../../src/app/api/game-servers/route');
    const { GET: readGameServerRoute } = await import('../../src/app/api/game-servers/[id]/route');
    const { GET: readDraftRoute, PUT: saveDraftRoute } = await import('../../src/app/api/game-servers/[id]/draft/route');
    const { POST: resetDraftRoute } = await import('../../src/app/api/game-servers/[id]/draft/reset/route');
    const applyRoute = await import('../../src/app/api/game-servers/[id]/apply/route');
    const { POST: pollRoute } = await import('../../src/app/game-server/poll/route');
    const { readDraft } = await import('../../src/lib/platform/drafts');
    const { pollActivity, setPollHoldMs } = await import('../../src/lib/platform/polls');
    const { setSupportedBuild } = await import('../../src/lib/platform/supported-build');
    const { WIPE_COMMAND } = await import('../../src/lib/config/encodeValues');
    const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
    settle = () => flushConfigWrites().catch(() => {});
    const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const registered = await register(session.request('/api/game-servers', json('POST', { name: `Review ${name}` })));
    assert.equal(registered.status, 201, 'the review registers its game server');
    const { gameServer: { id: gameServerId }, key }: { gameServer: { id: number }; key: string } = (await registered.json()).data;
    const draftUrl = `/api/game-servers/${gameServerId}/draft`;
    const at = { params: Promise.resolve({ id: String(gameServerId) }) };

    // The game server: a mod on the Supported build that polls with the key, and holds its poll until something is delivered.
    const BUILD = '20261102-153000';
    setSupportedBuild(BUILD, session.userId);
    // Held until an Apply wakes it, however long a review takes between Applies; hung up when the review ends.
    setPollHoldMs(3_600_000);
    type PollAnswer = { status: number; body: { answer: string; liveConfigurationId?: string; commands?: { database: string; category: string; values: string }[] } };
    let held: Promise<PollAnswer>;
    const poll = async (processed: unknown) => {
      const connection = new AbortController();
      held = pollRoute(new Request(new URL('/game-server/poll', env.publicUrl), {
        method: 'POST', signal: connection.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ buildStamp: BUILD, instanceId: `review-${name}`, processed }),
      })).then(async response => ({ status: response.status, body: await response.json() }));
      const answered = held;
      hangUp = async () => {
        connection.abort();
        await answered;
      };
      // Held once its body has arrived: from then on the game server is Connected.
      for (let tries = 0; !pollActivity(gameServerId).held; tries++) {
        assert(tries < 1_000, 'the game server\'s poll is held');
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    };
    await poll(null);
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
        await open();
      },
      async apply(stage = `apply-${Object.keys(stages).length + 1}`) {
        assert(!Object.hasOwn(stages, stage), `stage ${stage} is already captured`);
        await flushConfigWrites();
        // The owner's review, then Apply with the Draft revision and Live configuration id it was built from.
        const reviewed = await applyRoute.GET(session.request(`/api/game-servers/${gameServerId}/apply`), at);
        assert.equal(reviewed.status, 200, 'the review is built');
        const { revision, liveConfigurationId } = (await reviewed.json()).data;
        const response = await applyRoute.POST(session.request(`/api/game-servers/${gameServerId}/apply`, json('POST', { revision, liveConfigurationId })), at);
        const body = await response.json() as { success: boolean; error?: string; details?: { database: string; category?: string; key: string; error: string }[]; data?: { liveConfigurationId: string } };
        if (!response.ok) {
          assert(pollActivity(gameServerId).held, 'a refused Apply delivers nothing: the poll is still held');
          const details = body.details?.map(({ database, category, key, error }) => `${database}/${category}/${key}: ${error}`).join('; ');
          throw new Error(`Apply was refused (${response.status}): ${body.error}${details ? `: ${details}` : ''}`);
        }
        // The held poll is answered with the new Live configuration, grouped by category: the wipe goes first.
        const delivered = await held;
        assert.equal(delivered.status, 200);
        assert.equal(delivered.body.answer, 'live-configuration', 'Apply wakes the held poll with the Live configuration');
        assert.equal(delivered.body.liveConfigurationId, body.data!.liveConfigurationId, 'the delivery carries the new Live configuration id');
        const batch = [WIPE_COMMAND, ...delivered.body.commands!.map(({ database, category, values }) => `string ezconfig ${database} ${category} ${values}`)];
        assertDeliveredBatch(batch);
        // The mod processes it, and its next poll reports that, so it is held again and the Live configuration is Confirmed.
        const values = delivered.body.commands!.reduce((count, { values }) => count + Object.keys(JSON.parse(values)).length, 0);
        await poll({ liveConfigurationId: delivered.body.liveConfigurationId, result: { success: true, acceptedValues: values, changedValues: values, unknownKeys: [], failure: null } });
        const { liveConfiguration } = (await (await readGameServerRoute(session.request(`/api/game-servers/${gameServerId}`), at)).json()).data;
        assert.deepEqual([liveConfiguration?.id, liveConfiguration?.state], [delivered.body.liveConfigurationId, 'confirmed'], 'the success report makes the Live configuration Confirmed');
        assert.equal(readDraft(gameServerId)!.revision, revision, 'Apply leaves the Draft as it was');
        stages[stage] = batch;
        return [...batch];
      },
    });
    if (options.capture) {
      await mkdir(dirname(options.capture), { recursive: true });
      await writeFile(options.capture, JSON.stringify(stages, null, 2) + '\n', 'utf8');
    }
  } finally {
    await settle();
    await hangUp();
    closeStore();
    globalThis.fetch = originalFetch;
    const target = resolve(root);
    assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith(prefix));
    await rm(target, { recursive: true, force: true });
  }
}
