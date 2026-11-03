type Environment = Readonly<Record<string, string | undefined>>;
type Registration = { queue: Promise<void>; databasePath?: string };
const key = Symbol.for('ezconfig-ui.server-startup.platform-storage.v1');
const shared = globalThis as typeof globalThis & { [key: symbol]: Registration | undefined };

/**
 * Awaited by Next before request readiness; imports and builds never migrate.
 * Migrates the platform database at DATABASE_PATH, then starts the daily
 * sweep. A hot reload with the same DATABASE_PATH does nothing again.
 */
export async function registerServerStartup(environment: Environment = process.env): Promise<void> {
  if (environment.NEXT_RUNTIME !== 'nodejs' || environment.NEXT_PHASE === 'phase-production-build') return;
  const registration = shared[key] ??= { queue: Promise.resolve() };
  const next = registration.queue.then(async () => {
    const databasePath = environment.DATABASE_PATH;
    if (databasePath && registration.databasePath === databasePath) return;
    registration.databasePath = undefined;
    try {
      if (!databasePath) throw new Error('DATABASE_PATH is not set: the platform keeps everything in its SQLite database');
      if (!process.versions.bun) throw new Error('Platform storage uses bun:sqlite; run the app on Bun (bun --bun next start)');
      const { migratePlatformDatabase } = await import('./platform/storage');
      const result = migratePlatformDatabase(databasePath);
      if (result.applied.length) console.info(`[EZConfig platform storage] ${result.path}: version ${result.from} to ${result.to} (${result.applied.join(', ')})${result.copy ? `; copy before migrating: ${result.copy}` : ''}`);
      // Expired sessions and old Invites: a minute after start, then daily.
      (await import('./platform/retention')).startDailySweep();
    } catch (error) {
      console.error('[EZConfig platform storage] startup blocked:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
    registration.databasePath = databasePath;
  });
  registration.queue = next.catch(() => {});
  await next;
}
