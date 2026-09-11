// Run after NEXT_BUILD_DIR=.next-automatic-sync-test/geometry bun run build.
// Uses the actual Next entry point, isolated storage and disabled automatic sync.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-next-'));
const portProbe = createServer();
await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = (portProbe.address() as { port: number }).port;
await new Promise<void>(resolve => portProbe.close(() => resolve()));
const env = {
  ...process.env, NEXT_BUILD_DIR: '.next-automatic-sync-test/geometry',
  DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'), NOTES_PATH: join(root, 'Notes'),
  USERS_PATH: join(root, 'users.json'), ADMIN_USERNAME: 'geometry-fixture', ADMIN_PASSWORD: 'geometry-fixture-only',
  RCON_AUTO_SYNC_ENABLED: 'false', RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-unused',
};
const start = () => Bun.spawn(['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: process.cwd(), env, stdout: 'pipe', stderr: 'pipe' });
let child: ReturnType<typeof start> | undefined;
try {
  const character = join(env.DATABASES_PATH, 'Character');
  await mkdir(character, { recursive: true });
  await writeFile(join(character, 'Combat.json'), '{');
  child = start();
  const badStdout = new Response(child.stdout).text(), badStderr = new Response(child.stderr).text();
  await Bun.sleep(2000);
  const badResponse = await fetch(`http://127.0.0.1:${port}/api/databases/overrides`, { signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  assert.equal(badResponse?.status, 500, 'failed instrumentation blocks configuration reads');
  const badWrite = await fetch(`http://127.0.0.1:${port}/api/config/Character/Combat`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"entries":{"CanJumpKick":true}}' });
  assert.equal(badWrite.status, 500, 'failed instrumentation blocks configuration writes');
  assert.equal(await readFile(join(character, 'Combat.json'), 'utf8'), '{');
  if (child.exitCode === null) { child.kill(); await child.exited; }
  await badStdout;
  const err = await badStderr;
  assert(err.includes('startup blocked') && err.includes('invalid JSON'), err);
  console.info('PASS: actual Next malformed startup blocks config reads/writes with HTTP 500 and preserves original data (Next itself remains running)');

  await writeFile(join(character, 'Combat.json'), JSON.stringify({ LowBlockColliderRelativeOffsetScale: { x: 0, y: -1, z: 2 }, CanJumpKick: false }));
  child = start();
  const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text();
  const end = Date.now() + 15000;
  let response: Response | undefined;
  while (Date.now() < end) {
    response = await fetch(`http://127.0.0.1:${port}/api/databases/overrides`).catch(() => undefined);
    if (response?.status === 200) break;
    if (child.exitCode !== null) throw new Error(`Next startup exited: ${await stderr}`);
    await Bun.sleep(50);
  }
  assert.equal(response?.status, 200);
  const values = (await response!.json()).values;
  assert.deepEqual(values.character.Parry.LowBlockColliderRelativeOffsetScale, { x: 0, y: -1, z: 2 });
  assert.deepEqual(values.character.Combat, { CanJumpKick: false });
  console.info(`PASS: first actual Next config response has canonical Parry values; isolated browser URL http://127.0.0.1:${port}`);
  if (process.argv.includes('--keep-open')) {
    console.info('Isolated UI fixture login: geometry-fixture / geometry-fixture-only. Stop this process after browser verification.');
    await new Promise<void>(resolve => {
      process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
    });
  }
  child.kill(); await child.exited;
  await stdout; await stderr;
} finally {
  if (child && child.exitCode === null) { child.kill(); await child.exited; }
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-next-'));
  await rm(target, { recursive: true, force: true });
}
