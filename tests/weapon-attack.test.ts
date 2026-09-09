import { expect, test } from 'bun:test';
test('typed Attack controls and repaired knockback survive save, review, selection and wipe', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-attack-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
