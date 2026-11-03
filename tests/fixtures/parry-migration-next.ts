// Run after NEXT_BUILD_DIR=.next-automatic-sync-test/geometry bun run build.
// Uses the actual Next entry point on Bun, isolated storage, a platform session
// and disabled automatic sync.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-next-'));
const portProbe = createServer();
await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = (portProbe.address() as { port: number }).port;
await new Promise<void>(resolve => portProbe.close(() => resolve()));
const env = {
  ...process.env, NEXT_BUILD_DIR: '.next-automatic-sync-test/geometry',
  DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'), NOTES_PATH: join(root, 'Notes'),
  DATABASE_PATH: join(root, 'platform.db'), PUBLIC_URL: `http://127.0.0.1:${port}`,
  RCON_AUTO_SYNC_ENABLED: 'false', RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-unused',
};
// The session is made in this process, in the database the server opens.
Object.assign(process.env, { DATABASE_PATH: env.DATABASE_PATH, PUBLIC_URL: env.PUBLIC_URL });
const start = () => Bun.spawn([process.execPath, '--bun', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: process.cwd(), env, stdout: 'pipe', stderr: 'pipe' });
let child: ReturnType<typeof start> | undefined;
let session: TestSession | undefined;
try {
  session = await signInForTest('Geometry fixture');
  const signedIn = { Cookie: session.cookie, Origin: session.origin };
  const character = join(env.DATABASES_PATH, 'Character');
  await mkdir(character, { recursive: true });
  await writeFile(join(character, 'Combat.json'), '{');
  child = start();
  const badStdout = new Response(child.stdout).text(), badStderr = new Response(child.stderr).text();
  await Bun.sleep(2000);
  const badResponse = await fetch(`http://127.0.0.1:${port}/api/game-servers`, { headers: signedIn, signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  assert.equal(badResponse?.status, 500, 'failed instrumentation blocks reads');
  const badWrite = await fetch(`http://127.0.0.1:${port}/api/game-servers`, { method: 'POST', headers: { ...signedIn, 'Content-Type': 'application/json' }, body: '{"name":"Blocked"}' });
  assert.equal(badWrite.status, 500, 'failed instrumentation blocks writes');
  assert.equal(await readFile(join(character, 'Combat.json'), 'utf8'), '{');
  if (child.exitCode === null) { child.kill(); await child.exited; }
  await badStdout;
  const err = await badStderr;
  assert(err.includes('startup blocked') && err.includes('invalid JSON'), err);
  console.info('PASS: actual Next malformed startup blocks reads/writes with HTTP 500 and preserves original data (Next itself remains running)');

  await writeFile(join(character, 'Combat.json'), JSON.stringify({ LowBlockColliderRelativeOffsetScale: { x: 0, y: -1, z: 2 }, CanJumpKick: false }));
  child = start();
  const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text();
  const end = Date.now() + 15000;
  let response: Response | undefined;
  while (Date.now() < end) {
    response = await fetch(`http://127.0.0.1:${port}/api/game-servers`, { headers: signedIn }).catch(() => undefined);
    if (response?.status === 200) break;
    if (child.exitCode !== null) throw new Error(`Next startup exited: ${await stderr}`);
    await Bun.sleep(50);
  }
  assert.equal(response?.status, 200);
  // The self-hosted files, which automatic sync delivers until online-platform#41, are migrated before the first response.
  assert.deepEqual(JSON.parse(await readFile(join(character, 'Parry.json'), 'utf8')).LowBlockColliderRelativeOffsetScale, { x: 0, y: -1, z: 2 });
  assert.deepEqual(JSON.parse(await readFile(join(character, 'Combat.json'), 'utf8')), { CanJumpKick: false });
  console.info(`PASS: storage holds canonical Parry values before the first actual Next response; isolated browser URL http://127.0.0.1:${port}`);
  if (process.argv.includes('--keep-open')) {
    console.info(`Isolated UI fixture session (sign-in itself needs a Discord application): set the cookie ${session.cookie} for 127.0.0.1:${port}. Stop this process after browser verification.`);
    await new Promise<void>(resolve => {
      process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
    });
  }
  child.kill(); await child.exited;
  await stdout; await stderr;
} finally {
  if (child && child.exitCode === null) { child.kill(); await child.exited; }
  session?.close();
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-next-'));
  await rm(target, { recursive: true, force: true });
}
