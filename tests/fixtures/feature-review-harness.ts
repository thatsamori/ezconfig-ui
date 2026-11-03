/**
 * Feature review harness: the one way a feature review fixture drives its keys
 * like a server owner and checks what reaches the game server.
 *
 * The interface is shaped like the platform. A fixture sets and resets values
 * through the editor store, reads back what was saved, and Applies everything:
 * Apply delivers a wipe then one command per non-empty category, in today's
 * command encoding, and the mod's success report is simulated. There is no
 * selective apply.
 *
 * Today it runs on the self-hosted config and apply routes, with temp storage
 * and the RCON service mocked. Later tickets move it onto the Draft and real
 * delivery without changing the fixtures. Env must be set before the app is
 * imported, so a fixture is a standalone child process holding one review.
 */
import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { ConfigData, ConfigValue } from '../../src/lib/database/types';

export const WIPE = 'string ezconfig WipeDatabases';

/** The entries a batch sends for one category, as the mod reads them; undefined if it sends none. */
export function categoryEntries(batch: readonly string[], database: string, category: string): Record<string, string> | undefined {
  const command = batch.find(command => command.startsWith(`string ezconfig ${database} ${category} {`));
  return command === undefined ? undefined : JSON.parse(command.slice(command.indexOf('{')));
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
  /** Send a save past the editor's own checks, as a hand-made request could; resolves to its status. */
  saveUnchecked(database: string, category: string, entries: Record<string, unknown>): Promise<number>;
  /** Replace a category's stored values without validation, as an older schema could have saved them. */
  storeUnvalidated(database: string, category: string, entries: Record<string, unknown>): Promise<void>;
  /**
   * Apply the whole configuration; resolves to the delivered batch once the
   * mod reports success. The batch is captured under `stage`, or apply-N.
   * Rejects, with nothing delivered, when Apply is refused.
   */
  apply(stage?: string): Promise<string[]>;
  /** Every batch delivered so far, oldest first. */
  readonly delivered: readonly (readonly string[])[];
}

export interface FeatureReviewOptions {
  /** Write every delivered batch, keyed by stage, to this file (mod evidence). */
  capture?: string;
}

let opened = false;

export async function featureReview(name: string, run: (review: FeatureReview) => Promise<void>, options: FeatureReviewOptions = {}): Promise<void> {
  // The app's modules, and the env they read on import, are per process.
  assert(!opened, 'one feature review per process: run each review as its own child fixture');
  opened = true;
  const parent = resolve(tmpdir());
  const prefix = `ezconfig-review-${name}-`;
  const root = await mkdtemp(join(parent, prefix));
  // Nothing real is reachable: storage lives in the temp root, and RCON is
  // mocked below, with the host pinned to loopback should anything slip past.
  Object.assign(process.env, {
    DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'),
    NOTES_PATH: join(root, 'Notes'), USERS_PATH: join(root, 'users.json'),
    RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false',
  });
  await mkdir(join(root, 'Databases'));
  const delivered: string[][] = [];
  const stages: Record<string, string[]> = {};
  mock.module('../../src/lib/rcon/service', () => ({
    executeAcknowledgedBatch: async (commands: readonly string[]) => {
      delivered.push([...commands]);
      return successfulProcessingFixture(commands);
    },
  }));
  const originalFetch = globalThis.fetch;
  try {
    const { POST: saveCategory, GET: readCategory } = await import('../../src/app/api/config/[...path]/route');
    const { POST: applyRoute } = await import('../../src/app/api/apply/route');
    const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
    const { writeCategory } = await import('../../src/lib/database/service');
    // The editor's saves go straight into the real handler, without a live server.
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      assert(url.startsWith('/api/config/'), `unexpected editor request ${url}`);
      return saveCategory(new Request('http://localhost' + url, init) as never, {
        params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }),
      });
    }) as unknown as typeof fetch;
    const store = useConfigStore.getState();
    await run({
      set: (database, category, key, value) => store.setValue(database, category, key, value),
      reset: (database, category, key) => store.removeValue(database, category, key),
      async saved(database, category, key) {
        await flushConfigWrites();
        const response = await readCategory(new Request('http://localhost') as never, { params: Promise.resolve({ path: [database, category] }) });
        assert.equal(response.status, 200);
        return (await response.json()).data[key];
      },
      async saveUnchecked(database, category, entries) {
        const response = await saveCategory(new Request('http://localhost', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
        }) as never, { params: Promise.resolve({ path: [database, category] }) });
        return response.status;
      },
      storeUnvalidated: (database, category, entries) => writeCategory(database, category, entries as ConfigData),
      async apply(stage = `apply-${Object.keys(stages).length + 1}`) {
        assert(!Object.hasOwn(stages, stage), `stage ${stage} is already captured`);
        await flushConfigWrites();
        const before = delivered.length;
        // A refusal is the rejection itself, so its route log is not left on stderr.
        const logged: unknown[][] = [], log = console.error;
        console.error = (...args: unknown[]) => { logged.push(args); };
        // No commands in the request: the whole saved configuration, after a wipe.
        const response = await applyRoute(new Request('http://localhost/api/apply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        })).finally(() => { console.error = log; });
        if (response.status !== 200) throw new Error(`Apply was refused (${response.status}): ${(await response.json()).error}`);
        for (const args of logged) console.error(...args);
        assert.equal(delivered.length, before + 1, 'Apply delivers one batch');
        const batch = delivered[before];
        assertDeliveredBatch(batch);
        stages[stage] = batch;
        if (options.capture) await writeFile(options.capture, JSON.stringify(stages, null, 2) + '\n', 'utf8');
        return batch;
      },
      delivered,
    });
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(root);
    assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith(prefix));
    await rm(target, { recursive: true, force: true });
  }
}
