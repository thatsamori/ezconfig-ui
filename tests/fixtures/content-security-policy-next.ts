// Run after NEXT_BUILD_DIR=.next-automatic-sync-test/csp bun run build.
// Uses the actual Next entry point on Bun, isolated storage, a platform session
// and disabled automatic sync. Each page response carries the
// Content-Security-Policy with its own nonce, and every script in the page
// carries that nonce (online-platform#24). `--keep-open` leaves the server up
// for a browser check of the console.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-csp-next-'));
const portProbe = createServer();
await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = (portProbe.address() as { port: number }).port;
await new Promise<void>(resolve => portProbe.close(() => resolve()));
const url = `http://127.0.0.1:${port}`;
const env = {
  ...process.env, NEXT_BUILD_DIR: '.next-automatic-sync-test/csp',
  DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'),
  DATABASE_PATH: join(root, 'platform.db'), PUBLIC_URL: url,
  RCON_AUTO_SYNC_ENABLED: 'false', RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-unused',
};
// The session is made in this process, in the database the server opens.
Object.assign(process.env, { DATABASE_PATH: env.DATABASE_PATH, PUBLIC_URL: env.PUBLIC_URL });
const start = () => Bun.spawn([process.execPath, '--bun', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: process.cwd(), env, stdout: 'pipe', stderr: 'pipe' });
let child: ReturnType<typeof start> | undefined;
let session: TestSession | undefined;

/** The page's nonce, after checking that the policy has one and every script tag carries it. */
async function pageNonce(path: string, status: number): Promise<string> {
  const response = await fetch(url + path, { headers: { Accept: 'text/html', Cookie: session!.cookie } });
  assert.equal(response.status, status, path);
  const policy = response.headers.get('content-security-policy') ?? '';
  const nonce = /'nonce-([A-Za-z0-9+/]+={0,2})'/.exec(policy)?.[1];
  assert(nonce, `${path} has a nonce in its policy: ${policy}`);
  assert(policy.includes('https://cdn.discordapp.com') && !/script-src[^;]*'unsafe-inline'/.test(policy), policy);
  const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
  assert(scripts.length > 0, `${path} renders scripts`);
  for (const script of scripts) assert(script.includes(` nonce="${nonce}"`), `${path}: ${script}`);
  console.info(`PASS: ${path} carries the policy, and its ${scripts.length} scripts carry the nonce`);
  return nonce;
}

try {
  session = await signInForTest('CSP fixture');
  child = start();
  const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text();
  const end = Date.now() + 15000;
  while (!(await fetch(url).catch(() => undefined))?.ok) {
    if (child.exitCode !== null) throw new Error(`Next startup exited: ${await stderr}`);
    assert(Date.now() < end, 'Next started within 15 s');
    await Bun.sleep(50);
  }
  const first = await pageNonce('/', 200), second = await pageNonce('/', 200);
  assert.notEqual(first, second, 'the nonce changes per request');
  await pageNonce('/no-such-page', 404);
  const api = await fetch(`${url}/api/auth/session`, { headers: { Cookie: session.cookie } });
  assert.equal(api.status, 200);
  assert.equal(api.headers.get('content-security-policy'), null, 'API routes carry no page policy');
  console.info('PASS: a fresh nonce per page response; API routes are left alone');
  if (process.argv.includes('--keep-open')) {
    console.info(`Isolated browser check at ${url}: set the cookie ${session.cookie} for 127.0.0.1:${port}. Stop this process afterwards.`);
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
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-csp-next-'));
  await rm(target, { recursive: true, force: true });
}
