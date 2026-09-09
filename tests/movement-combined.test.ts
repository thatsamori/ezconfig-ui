import { expect, test } from 'bun:test';

test('all 13 Movement additions survive combined persistence, independent selection and partial reset', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-combined-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
