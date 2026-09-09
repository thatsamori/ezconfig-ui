import { expect, test } from 'bun:test';
test('combined Weapon and Movement policy persists, selects and resets through captured RCON', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-integration-review.ts'], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
