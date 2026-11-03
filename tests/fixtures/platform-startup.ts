// One app start: runs the real startup hook once with the inherited environment
// and working directory, then reports it as one JSON line. Each spawn is a fresh
// process, as a restart is. Automatic sync is replaced to record when it registers.
import { mock } from 'bun:test';
import { Database } from 'bun:sqlite';

const events: string[] = [], logged: string[] = [];
console.error = console.info = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
function version() {
  try {
    const database = new Database(process.env.DATABASE_PATH ?? '', { readonly: true });
    try { return String((database.query('PRAGMA user_version').get() as { user_version: number }).user_version); }
    finally { database.close(); }
  } catch { return 'none'; }
}
mock.module('../../src/lib/rcon/automatic-sync-bootstrap', () => ({
  stopRegisteredAutomaticSync: async () => {},
  registerAutomaticSync: async () => { events.push(`sync after version ${version()}`); },
}));
const { registerServerStartup } = await import('../../src/lib/server-startup');
let blocked: string | undefined;
try { await registerServerStartup({ ...process.env, NEXT_RUNTIME: 'nodejs' }); }
catch (error) { blocked = error instanceof Error ? error.message : String(error); }
process.stdout.write(JSON.stringify({ events, blocked, logged }));
