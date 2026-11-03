import { expect, test } from 'bun:test';

test('all 13 Movement additions survive the editor, Apply and partial reset together', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-combined-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
