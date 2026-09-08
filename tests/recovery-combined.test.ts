import { expect, test } from 'bun:test';

test('all seven recovery controls survive combined save, review, selective apply and partial reset', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/recovery-combined-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
