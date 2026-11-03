import { migrateParryGeometry } from './migrations/parry-geometry';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { registerAutomaticSync, stopRegisteredAutomaticSync } from './rcon/automatic-sync-bootstrap';

type Environment = Readonly<Record<string, string | undefined>>;
type Registration = { queue: Promise<void>; fingerprint?: string };
const key = Symbol.for('ezconfig-ui.server-startup.parry-migration.v1');
const shared = globalThis as typeof globalThis & { [key: symbol]: Registration | undefined };

/** Awaited by Next before request readiness; imports and builds never migrate. */
export async function registerServerStartup(environment: Environment = process.env): Promise<void> {
  if (environment.NEXT_RUNTIME !== 'nodejs' || environment.NEXT_PHASE === 'phase-production-build') return;
  const registration = shared[key] ??= { queue: Promise.resolve() };
  const fingerprint = createHash('sha256').update(JSON.stringify([
    resolve(environment.DATABASES_PATH || './Databases'), resolve(environment.PRESETS_PATH || './Presets'),
    environment.RCON_AUTO_SYNC_ENABLED, environment.RCON_HOST, environment.RCON_PORT,
    environment.RCON_PASSWORD, environment.RCON_AUTO_SYNC_OWNER_PORT,
    environment.DATABASE_PATH && resolve(environment.DATABASE_PATH),
  ])).digest('hex');
  const next = registration.queue.then(async () => {
    if (registration.fingerprint === fingerprint) return;
    registration.fingerprint = undefined;
    // HMR must not leave an old responder reading storage during recovery.
    await stopRegisteredAutomaticSync();
    // Self-hosted installs set no DATABASE_PATH and may run on Node, which has no bun:sqlite.
    if (environment.DATABASE_PATH) {
      try {
        if (!process.versions.bun) throw new Error('DATABASE_PATH is set, but platform storage uses bun:sqlite; run the app on Bun (bun --bun next start)');
        const { migratePlatformDatabase } = await import('./platform/storage');
        const result = migratePlatformDatabase(environment.DATABASE_PATH);
        if (result.applied.length) console.info(`[EZConfig platform storage] ${result.path}: version ${result.from} to ${result.to} (${result.applied.join(', ')})${result.copy ? `; copy before migrating: ${result.copy}` : ''}`);
      } catch (error) {
        console.error('[EZConfig platform storage] startup blocked:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    }
    try {
      await migrateParryGeometry({ databasesRoot: environment.DATABASES_PATH || './Databases', presetsRoot: environment.PRESETS_PATH || './Presets' });
    } catch (error) {
      console.error('[EZConfig migration] startup blocked; inspect backup and repair storage before restarting:', error instanceof Error ? error.message : 'Unknown error');
      throw error; // A failed migration may never be reduced to log-and-continue.
    }
    try { await registerAutomaticSync(environment); }
    catch (error) { console.error('[EZConfig sync] startup failed', error instanceof Error ? error.message : 'Invalid configuration'); }
    registration.fingerprint = fingerprint;
  });
  registration.queue = next.catch(() => {});
  await next;
}
