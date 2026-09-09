import { expect, test } from 'bun:test';

test('four logical Windup categories survive save, review, selected apply and reset', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-windup-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
