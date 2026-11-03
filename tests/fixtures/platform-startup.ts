// One app start: runs the real startup hook once with the inherited environment
// and working directory, then reports it as one JSON line. Each spawn is a fresh
// process, as a restart is. The daily sweep is replaced to record when it starts.
// With argv[2] 'repeated', a build and the edge runtime call the hook first, and
// the start is three calls at once, as hot reloads make.
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
mock.module('../../src/lib/platform/retention', () => ({
  startDailySweep: () => { events.push(`sweep after version ${version()}`); },
}));
const { registerServerStartup } = await import('../../src/lib/server-startup');
let blocked: string | undefined;
if (process.argv[2] === 'repeated') {
  await registerServerStartup({ ...process.env, NEXT_RUNTIME: 'nodejs', NEXT_PHASE: 'phase-production-build' });
  await registerServerStartup({ ...process.env, NEXT_RUNTIME: 'edge' });
  events.push(`build and edge leave version ${version()}`);
}
const starts = process.argv[2] === 'repeated' ? 3 : 1;
try { await Promise.all(Array.from({ length: starts }, () => registerServerStartup({ ...process.env, NEXT_RUNTIME: 'nodejs' }))); }
catch (error) { blocked = error instanceof Error ? error.message : String(error); }
process.stdout.write(JSON.stringify({ events, blocked, logged }));
