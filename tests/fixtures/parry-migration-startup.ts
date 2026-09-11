import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-startup-'));
const events: string[] = [], errors: unknown[][] = [];
const oldError = console.error;
console.error = (...args) => errors.push(args);
let currentRoot = '';
mock.module('../../src/lib/rcon/automatic-sync-bootstrap', () => ({
  stopRegisteredAutomaticSync: async () => { events.push('stop'); },
  registerAutomaticSync: async (environment: Record<string, string>) => {
    events.push('sync-registration');
    if (environment.RCON_AUTO_SYNC_ENABLED === 'true') {
      const combat = JSON.parse(await readFile(join(currentRoot, 'Character', 'Combat.json'), 'utf8'));
      const parry = JSON.parse(await readFile(join(currentRoot, 'Character', 'Parry.json'), 'utf8'));
      assert(!Object.hasOwn(combat, 'LowBlockColliderRelativeOffsetScale'));
      assert.deepEqual(parry.LowBlockColliderRelativeOffsetScale, { x: 0, y: -1, z: 2 });
      events.push('ready-to-sync');
    }
  },
}));
try {
  const { registerServerStartup } = await import('../../src/lib/server-startup');
  assert.deepEqual(await readdir(root), [], 'import performs no migration');
  const environment = { NEXT_RUNTIME: 'nodejs', DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets') };
  await registerServerStartup({ ...environment, NEXT_PHASE: 'phase-production-build', RCON_AUTO_SYNC_ENABLED: 'true' });
  await registerServerStartup({ ...environment, NEXT_RUNTIME: 'edge' });
  assert.deepEqual(events, []);
  assert.deepEqual(await readdir(root), [], 'build and edge do not touch storage');
  await mkdir(join(environment.DATABASES_PATH, 'Character'), { recursive: true });
  await writeFile(join(environment.DATABASES_PATH, 'Character', 'Combat.json'), '{"LowBlockColliderRelativeOffsetScale":{"x":0,"y":-1,"z":2}}');
  currentRoot = environment.DATABASES_PATH;
  await Promise.all(Array.from({ length: 5 }, () => registerServerStartup(environment)));
  assert.deepEqual(events, ['stop', 'sync-registration'], 'disabled sync still migrates; repeated HMR does not restart');
  assert.deepEqual(JSON.parse(await readFile(join(currentRoot, 'Character', 'Parry.json'), 'utf8')), { LowBlockColliderRelativeOffsetScale: { x: 0, y: -1, z: 2 } });
  await registerServerStartup({ ...environment, RCON_AUTO_SYNC_ENABLED: 'true' });
  assert.deepEqual(events.slice(-3), ['stop', 'sync-registration', 'ready-to-sync']);

  const bad = { ...environment, DATABASES_PATH: join(root, 'bad'), RCON_AUTO_SYNC_ENABLED: 'true' };
  await mkdir(join(bad.DATABASES_PATH, 'Character'), { recursive: true });
  await writeFile(join(bad.DATABASES_PATH, 'Character', 'Combat.json'), '{');
  const before = events.length;
  await assert.rejects(registerServerStartup(bad), /invalid JSON/);
  assert.deepEqual(events.slice(before), ['stop'], 'failed migration never registers sync or emits a wipe');
  assert.equal(errors.length, 1);
  await writeFile(join(bad.DATABASES_PATH, 'Character', 'Combat.json'), '{}');
  await registerServerStartup({ ...bad, RCON_AUTO_SYNC_ENABLED: 'false' });
  assert.deepEqual(events.slice(-2), ['stop', 'sync-registration'], 'repair can retry after rejection');
} finally {
  console.error = oldError;
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-startup-'));
  await rm(target, { recursive: true, force: true });
}
