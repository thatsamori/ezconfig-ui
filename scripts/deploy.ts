/**
 * bun run deploy <commit>
 *
 * Deploys a commit to the platform instance (docs/hosting.md). Only commits on
 * GitHub's main are deployed, since the instance fetches the commit from the
 * public repo. Over SSH, this runs deploy/release.sh as root on the instance:
 * it builds the commit in a new release folder while the current one keeps
 * serving, switches to it, restarts the app and keeps the newest 3 releases.
 *
 * The instance is the SSH host `ezconfig-platform` (an alias in ~/.ssh/config),
 * or DEPLOY_SSH_HOST.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const host = process.env.DEPLOY_SSH_HOST || 'ezconfig-platform';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(...args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { ok: result.exitCode === 0, out: result.stdout.toString().trim(), err: result.stderr.toString().trim() };
}

const [commit, ...extra] = process.argv.slice(2);
if (!commit || extra.length) fail('usage: bun run deploy <commit>');

const fetched = git('fetch', '--quiet', 'origin', 'main');
if (!fetched.ok) fail(`git fetch origin main failed: ${fetched.err}`);
const resolved = git('rev-parse', '--verify', '--quiet', `${commit}^{commit}`);
if (!resolved.ok) fail(`${commit} is not a commit in this repo`);
const sha = resolved.out;
if (!git('merge-base', '--is-ancestor', sha, 'origin/main').ok) fail(`${sha} is not on origin/main: push it to main first`);

// LF only, whatever this checkout's line endings: bash runs it on the instance.
const script = readFileSync(join(import.meta.dir, '..', 'deploy', 'release.sh'), 'utf8').replaceAll('\r\n', '\n');

console.log(`Deploying ${sha} to ${host}`);
const started = performance.now();
const ssh = Bun.spawn(['ssh', '-T', host, 'sudo', 'bash', '-s', '--', sha], { stdin: new TextEncoder().encode(script), stdout: 'inherit', stderr: 'inherit' });
const exitCode = await ssh.exited;
const seconds = Math.round((performance.now() - started) / 1000);
if (exitCode !== 0) fail(`Deploy of ${sha} failed after ${seconds} s (ssh exited ${exitCode})`);
console.log(`Deployed ${sha} to ${host} in ${seconds} s`);
